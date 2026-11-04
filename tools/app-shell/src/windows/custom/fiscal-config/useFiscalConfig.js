import { useState, useEffect, useCallback } from 'react';
import { detectProfile, activeOrNull, isActiveRecord } from './fiscalConfig.utils.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { parseAdoptionDate } from '@/windows/custom/shared/fiscalTargets.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { configureFiscalSystem, fetchCreatedRecords } from './fiscalSystemApi.js';

// Confirmed from artifacts/*/contract.json → backendContract.window.primaryEntity
const SII_ENTITY      = 'siiConfiguration';
const TBAI_ENTITY     = 'header';
const VERIFACTU_ENTITY = 'cabeceraDeConfiguraciónVerifactu';

// ETP-5229 — the field each system's config row carries its cutover/"acogida"
// timestamp under. Confirmed against the AD columns: aeatsii_config.insiisystemdate
// (Java property FechaAcogidaSII — NEO apiKey `fechaAcogidaSII`), tbai_config.tbaisystemdate,
// etvfac_verifactu_config.IN_Vfactu_System.
//
// ETP-5432 #1 — SII previously read `monitordate` ("SII monitor start date", a
// separate, cosmetic field — see docs/generated-custom-windows/sii-config.md)
// instead of `fechaAcogidaSII` ("SII enrollment date", the real "fecha de
// acogida"). Classic's own gate — `UpdateInvoicesPreSii.java`'s
// `siiConfig.getFechaAcogidaSII()` and the `AEATSII_PreSII_Invoice` auxiliary
// input, both reading `aeatsii_config.insiisystemdate` — never looks at
// `monitordate` for this purpose. Using `monitordate` let an org whose SII
// monitor happened to start earlier than its real enrollment date show a live
// SII status (and offer "Enviar a SIF") for invoices dated before it was ever
// SII-enrolled — live-tested on invoice 10000075 (accountingDate 22/09/2026,
// fechaAcogidaSII 24/09/2026).
const CUTOVER_FIELD = {
  sii: 'fechaAcogidaSII',
  tbai: 'tbaisystemdate',
  verifactu: 'inVfactuSystem',
};

// ETP-5229 — exported so other fiscal windows (e.g. useFiscalMonitor.js) reuse
// the SAME "all rows" fetch + earliest-cutover computation instead of building
// a parallel mechanism. See fetchAllRows/earliestCutoverDate below.
export async function fetchAllRows(apiFetch, specName, entityName, orgId) {
  // NEO reads with NO_ACTIVE_FILTER=true, so an org can carry inactive
  // ("Change SIF") trace rows alongside a live one. We deliberately fetch ALL
  // rows here (not just the active one) — ETP-5229 needs the EARLIEST cutover
  // date across every config row this org ever had for this system, including
  // deactivated ones, to gate whether a historical invoice predates the
  // system's existence for this org at all. A single org/system pair realistically
  // has a handful of config rows (one active + at most a couple of superseded
  // ones from "Change SIF"), so a generous page size avoids a second request
  // without paginating.
  const params = new URLSearchParams({ organization: orgId, _limit: '50' });
  const res = await apiFetch(`/${specName}/${entityName}?${params}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to load ${specName}: HTTP ${res.status}`);
  const json = await res.json();
  return json?.response?.data ?? [];
}

// Prefer the active row rather than blindly taking the first, so a leftover
// inactive trace never masks a real active config.
function pickDisplayRecord(rows) {
  if (rows.length === 0) return null;
  return rows.find(isActiveRecord) ?? rows[0];
}

/**
 * Earliest cutover/"acogida" date across ALL config rows (active or not) an
 * org ever had for one fiscal system. Used to gate whether a document's date
 * predates the system's existence for this org entirely — as opposed to the
 * CURRENTLY active config's own (possibly much later) cutover date, which is
 * the wrong comparison once an org has changed SIF and the new config's
 * cutover post-dates invoices that were genuinely sent under the old one.
 *
 * @param {Array<object>} rows all rows returned for the org+system (active or not)
 * @param {'sii'|'tbai'|'verifactu'} system
 * @returns {string|null} the earliest row's raw value (a `yyyy-MM-dd` date for
 *   SII/TBAI, a timestamp for VERI*FACTU), or null if no row carries the field
 */
export function earliestCutoverDate(rows, system) {
  const field = CUTOVER_FIELD[system];
  let earliestMs = null;
  let earliestRaw = null;
  for (const row of rows) {
    const raw = row?.[field];
    // ETP-5700 — parseAdoptionDate reads a date-only value (SII/TBAI cutovers are AD
    // Date columns, serialised as `yyyy-MM-dd`) as a LOCAL calendar day instead of
    // UTC midnight, so rows are ordered in the same calendar space the gates use.
    const parsed = parseAdoptionDate(raw);
    if (!parsed) continue;
    const ms = parsed.getTime();
    if (earliestMs === null || ms < earliestMs) {
      earliestMs = ms;
      earliestRaw = raw;
    }
  }
  // The winning row's value is returned AS-IS rather than re-serialised with
  // toISOString(): a date-only `yyyy-MM-dd` turned into `...T00:00:00.000Z` would be
  // read back as UTC midnight by every consumer, which east of UTC is already the
  // next local hour — exactly the shift that hid the send action (ETP-5700).
  return earliestRaw;
}

export function useFiscalConfig(orgId, apiBaseUrl) {
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [state, setState] = useState({
    loading: false,
    error: null,
    profile: null,
    siiRecord: null,
    tbaiRecord: null,
    verifactuRecord: null,
    // ETP-5229: earliest-ever cutover date per system, across ALL config rows
    // (active or deactivated) — see earliestCutoverDate() above.
    earliestSiiCutoverDate: null,
    earliestTbaiCutoverDate: null,
    earliestVerifactuCutoverDate: null,
  });

  const load = useCallback(async () => {
    if (!orgId) {
      setState({
        loading: false, error: null, profile: 'unconfigured',
        siiRecord: null, tbaiRecord: null, verifactuRecord: null,
        earliestSiiCutoverDate: null, earliestTbaiCutoverDate: null, earliestVerifactuCutoverDate: null,
      });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      // NEO reads with NO_ACTIVE_FILTER=true, so a deactivated ("Change SIF")
      // trace row can come back. We keep ALL rows here (not just the active
      // one) — resolving the profile still drops inactive rows, but ETP-5229's
      // earliest-cutover gate needs the full history.
      const [siiRows, tbaiRows, verifactuRows] = await Promise.all([
        fetchAllRows(apiFetch, 'sii-config', SII_ENTITY, orgId),
        fetchAllRows(apiFetch, 'tbai-config', TBAI_ENTITY, orgId),
        fetchAllRows(apiFetch, 'verifactu-config', VERIFACTU_ENTITY, orgId),
      ]);
      const sii = activeOrNull(pickDisplayRecord(siiRows));
      const tbai = activeOrNull(pickDisplayRecord(tbaiRows));
      const verifactu = activeOrNull(pickDisplayRecord(verifactuRows));
      setState({
        loading: false,
        error: null,
        siiRecord: sii,
        tbaiRecord: tbai,
        verifactuRecord: verifactu,
        profile: detectProfile(sii, tbai, verifactu),
        earliestSiiCutoverDate: earliestCutoverDate(siiRows, 'sii'),
        earliestTbaiCutoverDate: earliestCutoverDate(tbaiRows, 'tbai'),
        earliestVerifactuCutoverDate: earliestCutoverDate(verifactuRows, 'verifactu'),
      });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [orgId, apiFetch]);

  useEffect(() => { load(); }, [load]);

  /**
   * "Añadir SII": activates the complementary system on top of the current one through the
   * backend's `configureFiscalSystem` action (ETP-6053) — the same call, rules and records as the
   * wizard and agents. No territory is sent: the server takes the existing TicketBAI's, derives
   * every SII value from it, and refuses (in the request language) what the wizard would refuse.
   * Returns the created record. Throws with the server's message on refusal.
   *
   * @param {'sii'|'tbai'} system
   * @param {string} orgId
   * @returns {Promise<object|null>}
   */
  async function createComplementary(system, orgId) {
    const outcome = await configureFiscalSystem(apiFetch, orgId, { system: system.toUpperCase() });
    const records = await fetchCreatedRecords(apiFetch, outcome?.created);
    return records[system] ?? null;
  }

  return { ...state, refetch: load, createComplementary };
}
