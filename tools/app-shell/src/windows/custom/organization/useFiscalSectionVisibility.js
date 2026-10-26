// Which fiscal sections of the Organization window apply to this organization (ETP-5831).
//
// A fiscal section is only shown when a fiscal configuration that uses it is active, wherever the
// user arrives from (menu, direct link, Primeros pasos, a fiscal-incident deep link):
//
//   Actividades IAE                   model 303 OR model 390 active in the catalog
//   Representante legal / Modelo 390  model 390 active in the catalog
//   Certificado digital               SII, TicketBAI or VERI*FACTU active for the organization, OR
//                                     any active model the registry marks `telematicFiling`
//                                     (303 and 390 today; 349 alone does not need a certificate)
//
// Sources: the fiscal models catalog (`useFiscalModelsCatalog`, `{}` = no model active) and the
// organization's active SII / TicketBAI / VERI*FACTU records (`useFiscalConfig`, reused as is).
//
// Fail closed: a source that fails to load contributes nothing, so its sections stay hidden and
// the rest of the page keeps working. Every flag starts `false` and can only turn `true` once its
// source has settled, so a section never flashes in and back out while loading. On an
// organization switch the previous organization's fiscal config is ignored until the new one has
// loaded (`useFiscalConfigIsForOrg`). The catalog is client-level, so an org switch does not
// make it stale.
import { useState } from 'react';
import { useFiscalModelsCatalog, isModelActive } from '../fiscal-models/useFiscalModelsCatalog.js';
import { listModels } from '../fiscal-models/modelRegistry.js';
import { useFiscalConfig } from '../fiscal-config/useFiscalConfig.js';

/** Catalog models whose declarations read the organization's IAE activities. */
export const IAE_MODEL_IDS = Object.freeze(['303', '390']);
/** Catalog models whose declarations read the legal representative / natural-person identity. */
export const MODELO_390_MODEL_IDS = Object.freeze(['390']);
/** Catalog models filed telematically to the AEAT, which need the organization's certificate. */
export const TELEMATIC_MODEL_IDS = Object.freeze(listModels().filter(m => m.telematicFiling).map(m => m.id));

// The fields of a useFiscalConfig result that change when it (re)loads.
const FISCAL_STATE_FIELDS = ['siiRecord', 'tbaiRecord', 'verifactuRecord', 'profile', 'error'];

function snapshotFiscal(fiscal) {
  return FISCAL_STATE_FIELDS.map(f => fiscal[f]);
}

function fiscalChangedSince(snapshot, fiscal) {
  return FISCAL_STATE_FIELDS.some((f, i) => fiscal[f] !== snapshot[i]);
}

/**
 * True once the useFiscalConfig result belongs to `orgId`.
 *
 * useFiscalConfig (shared with the fiscal-config window, left untouched) keeps its last settled
 * state when `orgId` changes and only flips `loading` inside its effect, so the first render for
 * a new organization still carries the PREVIOUS organization's records with `loading: false`.
 * When `orgId` changes (not on mount), the current result is snapshotted; it counts as the new organization's
 * once a load is seen (`loading: true`) or any of its fields moves away from that snapshot.
 * State adjusted during render (React's "storing information from previous renders" pattern), so
 * the stale render itself is already fail-closed — no effect lag.
 */
function useFiscalConfigIsForOrg(orgId, fiscal) {
  // On mount there is no previous organization: the reader's first state is its own pristine
  // one (`profile: null`, not settled) or already this organization's, so it is trusted.
  const [track, setTrack] = useState(() => ({ orgId, snapshot: null, fresh: true }));
  let next = track;
  if (next.orgId !== orgId) next = { orgId, snapshot: snapshotFiscal(fiscal), fresh: false };
  if (!next.fresh && (fiscal.loading || fiscalChangedSince(next.snapshot, fiscal))) next = { ...next, fresh: true };
  if (next !== track) setTrack(next);
  return next.fresh;
}

function anyActive(activeModels, ids) {
  return ids.some(id => isModelActive(activeModels, id));
}

/**
 * Pure visibility rule — exported for tests.
 *
 * @param {{ activeModels?: object, catalogOk?: boolean, siiRecord?: *, tbaiRecord?: *,
 *           verifactuRecord?: *, fiscalOk?: boolean }} input
 * @returns {{ showIae: boolean, show390: boolean, showCert: boolean }}
 */
export function resolveFiscalSectionVisibility({
  activeModels = {}, catalogOk = false,
  siiRecord = null, tbaiRecord = null, verifactuRecord = null, fiscalOk = false,
} = {}) {
  const models = catalogOk ? activeModels : {};
  const fiscalSystemActive = fiscalOk && Boolean(siiRecord || tbaiRecord || verifactuRecord);
  return {
    showIae: anyActive(models, IAE_MODEL_IDS),
    show390: anyActive(models, MODELO_390_MODEL_IDS),
    showCert: fiscalSystemActive || anyActive(models, TELEMATIC_MODEL_IDS),
  };
}

/**
 * @param {string|null} orgId
 * @param {string} apiBaseUrl the page's spec URL (`.../sws/neo/organization`)
 * @returns {{ showIae: boolean, show390: boolean, showCert: boolean, loading: boolean }}
 */
export function useFiscalSectionVisibility(orgId, apiBaseUrl) {
  const catalog = useFiscalModelsCatalog(apiBaseUrl);
  const fiscal = useFiscalConfig(orgId, apiBaseUrl);
  const fiscalIsForOrg = useFiscalConfigIsForOrg(orgId, fiscal);
  // useFiscalConfig starts at `loading: false, profile: null` before its first load runs, so
  // "settled" is a resolved profile or an error, not just `!loading` — and it must be THIS
  // organization's result (ETP-5831: on an org switch the previous one's records linger a render).
  const fiscalSettled = fiscalIsForOrg && !fiscal.loading && (fiscal.profile !== null || fiscal.error != null);
  const visibility = resolveFiscalSectionVisibility({
    activeModels: catalog.activeModels,
    catalogOk: catalog.loaded && !catalog.error,
    siiRecord: fiscal.siiRecord,
    tbaiRecord: fiscal.tbaiRecord,
    verifactuRecord: fiscal.verifactuRecord,
    fiscalOk: fiscalSettled && !fiscal.error,
  });
  return { ...visibility, loading: !catalog.loaded || !fiscalSettled };
}
