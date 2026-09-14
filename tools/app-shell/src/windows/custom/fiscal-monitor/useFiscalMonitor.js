import { useState, useEffect, useCallback } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { detectProfile, activeOrNull, isActiveRecord } from '../fiscal-config/fiscalConfig.utils.js';
import { fetchAllRows, earliestCutoverDate } from '../fiscal-config/useFiscalConfig.js';
import { computeKpis } from './fiscalMonitor.utils.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

// ── Config entity names (for profile detection) ───────────────────────────────
const SII_CFG_SPEC         = 'sii-config';
const SII_CFG_ENTITY       = 'siiConfiguration';
const TBAI_CFG_SPEC        = 'tbai-config';
const TBAI_CFG_ENTITY      = 'header';
const VF_CFG_SPEC          = 'verifactu-config';
const VF_CFG_ENTITY        = 'cabeceraDeConfiguraciónVerifactu';

// ── SII Monitor entity names ──────────────────────────────────────────────────
const SII_SPEC                   = 'sii-monitor';
const SII_EMITIDAS_ENTITY        = 'issuedInvoices';
const SII_RECIBIDAS_ENTITY       = 'receivedInvoices';
const SII_EMITIDAS_ANT_ENTITY    = 'issuedInvoices(previousPeriod)';
const SII_RECIBIDAS_ANT_ENTITY   = 'receivedInvoices(previousPeriod)';

// ── Monitor Verifactu entity names ────────────────────────────────────────────
const VF_SPEC              = 'monitor-verifactu';
const VF_ACEPTADAS_ENTITY  = 'facturasAceptadas';
const VF_PARCIAL_ENTITY    = 'facturasParcialmenteAceptadas';
const VF_RECHAZADAS_ENTITY = 'facturasRechazadas';
const VF_INVALIDAS_ENTITY  = 'facturasInválidas';

// ── TBAI entity names ─────────────────────────────────────────────────────────
const TBAI_SPEC   = 'tbai-facturas-enviadas';
const TBAI_ENTITY = 'sincronización';
// Validation results (Tbai_Valcode) — 0..N error reasons per sincronización row,
// joined client-side via tbaiSyncinvoiceID → Tbai_Syncinvoice_ID (row.id).
const TBAI_VALIDATION_ENTITY = 'resultadoValidación';
// ─────────────────────────────────────────────────────────────────────────────

async function get(apiFetch, spec, entity, params) {
  const url = `/${spec}/${encodeURIComponent(entity)}?${new URLSearchParams(params)}`;
  const res = await apiFetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${spec}/${entity} HTTP ${res.status}`);
  return (await res.json())?.response ?? {};
}

async function fetchConfigRecord(apiFetch, spec, entity, orgId) {
  try {
    // NEO reads with NO_ACTIVE_FILTER=true; prefer the active row so a
    // deactivated ("Change SIF") trace row never masks a live config.
    const resp = await get(apiFetch, spec, entity, { organization: orgId, _limit: '10' });
    const rows = resp.data ?? [];
    if (rows.length === 0) return null;
    return rows.find(isActiveRecord) ?? rows[0];
  } catch {
    // 404 = spec/module not installed for this org → treat as not configured
    return null;
  }
}

// ETP-5229 — safe wrapper around the shared fetchAllRows() (useFiscalConfig.js):
// a 404 (module not installed for this org) resolves to [] instead of throwing,
// matching fetchConfigRecord's own fallback above.
async function fetchAllConfigRowsSafe(apiFetch, spec, entity, orgId) {
  try {
    return await fetchAllRows(apiFetch, spec, entity, orgId);
  } catch {
    return [];
  }
}

// ETP-5229 — TBAI_SyncInvoice's tab HQL already projects a joined invoice date
// under this alias (confirmed: TbaiMonitorSection.jsx reads row.invoiceDate,
// a property with no matching column in the raw AD field list — i.e. NEO
// already returns it as a filterable criteria fieldName, not just a display
// convenience). Used to gate the monitor's counts/list/export to the org's
// earliest-ever TBAI cutover, so pre-enrollment noise is excluded while
// invoices sent under an old/deactivated config still count (ETP-5229 #13).
const TBAI_DATE_FIELD = 'invoiceDate';

// ETP-5229 #17 — the ETVFAC_INV_SENT_STATUS_V view (backing monitor-verifactu's
// entities) previously projected NO date column at all. Fixed on the
// com.etendoerp.verifactu side by adding `ci.dateinvoiced AS invoice_date` to
// the view plus a new `Invoice_Date` AD_Column registration, whose NAME
// ("Invoice Date") derives the same camelCase apiKey as TBAI's field —
// confirmed against artifacts/monitor-verifactu/schema-raw.json's sibling
// columns (e.g. `Legal_Entity_Nif` → "Issuer tax ID" → apiKey `issuerTaxID`).
// Requires `update.database` in com.etendoerp.verifactu to take effect, plus a
// `make regen ONLY=monitor-verifactu` re-extract before this field shows up in
// the contract.
const VF_DATE_FIELD = 'invoiceDate';

function buildCutoverCriteria(cutoverDate, fieldName = TBAI_DATE_FIELD) {
  if (!cutoverDate) return [];
  return [{ fieldName, operator: 'greaterOrEqual', value: cutoverDate.slice(0, 10) }];
}

async function fetchCount(apiFetch, spec, entity, params) {
  const resp = await get(apiFetch, spec, entity, { ...params, _limit: '1' });
  return { totalCount: resp.totalRows ?? 0 };
}

async function fetchSiiParentId(apiFetch, orgId) {
  // The sii-monitor spec's child entities (issuedInvoices, receivedInvoices, etc.) are
  // child tabs of the "organizations" (aeatsii_config) entity. NEO Headless requires
  // a parentId (the aeatsii_config record PK) to correctly resolve the tab HQL tokens.
  // NEO does not expose `id` for this entity — extract the PK from the $ref field
  // (format: "aeatsii_config/<UUID>") or fall back to the configuracínSII field.
  //
  // NEO reads with NO_ACTIVE_FILTER=true, so an org can carry an inactive
  // ("Change SIF") trace row alongside a live one. Pull a small page and prefer
  // the active row — same pattern as fetchConfigRecord() above — instead of
  // blindly taking index 0 (ETP-5229): resolving to a stale/deactivated config
  // row's monitordate desynced the current/previous period buckets shown here
  // from the org's real active config, which is what Classic's SII monitor uses.
  const resp = await get(apiFetch, SII_SPEC, 'organizations', { organization: orgId, _limit: '10' });
  const rows = resp.data ?? [];
  if (rows.length === 0) return null;
  const row = rows.find(isActiveRecord) ?? rows[0];
  if (row.id) return row.id;
  const ref = row['$ref'];
  if (ref) return ref.split('/').pop() ?? null;
  return row.configuracinSII ?? null;
}

async function fetchSiiMonitorData(apiFetch, orgId) {
  const parentId = await fetchSiiParentId(apiFetch, orgId);
  if (!parentId) {
    return { counts: { issued: { totalCount: 0 }, received: { totalCount: 0 }, issuedPrevious: { totalCount: 0 }, receivedPrevious: { totalCount: 0 } }, parentId: null };
  }
  const siiParams = { parentId };
  const [issued, received, issuedPrev, receivedPrev] = await Promise.all([
    fetchCount(apiFetch, SII_SPEC, SII_EMITIDAS_ENTITY,      siiParams),
    fetchCount(apiFetch, SII_SPEC, SII_RECIBIDAS_ENTITY,     siiParams),
    fetchCount(apiFetch, SII_SPEC, SII_EMITIDAS_ANT_ENTITY,  siiParams),
    fetchCount(apiFetch, SII_SPEC, SII_RECIBIDAS_ANT_ENTITY, siiParams),
  ]);
  return {
    counts: { issued, received, issuedPrevious: issuedPrev, receivedPrevious: receivedPrev },
    parentId,
  };
}

/**
 * @param {string|null} cutoverDate earliest-ever Verifactu cutover date for this org
 * (across ALL config rows, active or not — earliestCutoverDate() in useFiscalConfig.js).
 * Applied as a lower bound on invoiceDate (see VF_DATE_FIELD above) so the monitor keeps
 * counting invoices sent under an old/deactivated config, while excluding anything that
 * predates the org's Verifactu enrollment entirely — the same gate TBAI already got in
 * ETP-5229 #13, now possible for Verifactu since the backing view projects invoiceDate.
 */
async function fetchVerifactuMonitorData(apiFetch, orgId, cutoverDate) {
  // The monitor-verifactu child tabs filter only by verifactuSendingStatus (HQL fixed to
  // not include @AD_Org_id@). OBDal/OBQuery applies org visibility automatically from the
  // JWT context, so passing _org is sufficient for scoping.
  const cutoverCriteria = buildCutoverCriteria(cutoverDate, VF_DATE_FIELD);
  const vfParams = { _org: orgId };
  if (cutoverCriteria.length) vfParams.criteria = JSON.stringify(cutoverCriteria);
  const [accepted, partial, rejected, invalid] = await Promise.all([
    fetchCount(apiFetch, VF_SPEC, VF_ACEPTADAS_ENTITY,  vfParams),
    fetchCount(apiFetch, VF_SPEC, VF_PARCIAL_ENTITY,    vfParams),
    fetchCount(apiFetch, VF_SPEC, VF_RECHAZADAS_ENTITY, vfParams),
    fetchCount(apiFetch, VF_SPEC, VF_INVALIDAS_ENTITY,  vfParams),
  ]);
  return { accepted, partiallyAccepted: partial, rejected, invalid };
}

async function fetchCountByCriteria(apiFetch, spec, entity, orgId, field, value, extraCriteria = []) {
  const params = {
    organization: orgId,
    _limit: '1',
    criteria: JSON.stringify([{ fieldName: field, operator: 'equals', value }, ...extraCriteria]),
  };
  const resp = await get(apiFetch, spec, entity, params);
  return resp.totalRows ?? 0;
}

/**
 * @param {string|null} cutoverDate earliest-ever TBAI cutover date for this org
 * (across ALL config rows, active or not — see earliestCutoverDate() in
 * useFiscalConfig.js). Applied as a lower bound so the monitor keeps counting
 * invoices sent under an old/deactivated config, while excluding anything
 * that predates the org's TBAI enrollment entirely (ETP-5229 #13).
 */
async function fetchTbaiData(apiFetch, orgId, cutoverDate) {
  const cutoverCriteria = buildCutoverCriteria(cutoverDate);
  const totalParams = { organization: orgId, _limit: '1' };
  if (cutoverCriteria.length) totalParams.criteria = JSON.stringify(cutoverCriteria);
  const [total, received, rejected, error, pending] = await Promise.all([
    get(apiFetch, TBAI_SPEC, TBAI_ENTITY, totalParams).then(r => r.totalRows ?? 0),
    fetchCountByCriteria(apiFetch, TBAI_SPEC, TBAI_ENTITY, orgId, 'estado', 'Recibido',  cutoverCriteria),
    fetchCountByCriteria(apiFetch, TBAI_SPEC, TBAI_ENTITY, orgId, 'estado', 'Rechazado', cutoverCriteria),
    fetchCountByCriteria(apiFetch, TBAI_SPEC, TBAI_ENTITY, orgId, 'estado', 'Error',     cutoverCriteria),
    fetchCountByCriteria(apiFetch, TBAI_SPEC, TBAI_ENTITY, orgId, 'estado', 'Pendiente', cutoverCriteria),
  ]);
  return { totalCount: total, receivedCount: received, rejectedCount: rejected, errorCount: error, pendingCount: pending };
}

/**
 * Fetches every resultadoValidación row for the org (Tbai_Valcode table) — the
 * error-reason detail (codigo/descripcion) for TBAI rows in Rechazado/Error
 * status. There's no per-invoice endpoint, so we fetch the full set once and
 * join client-side by tbaiSyncinvoiceID → sincronización row id (see
 * TbaiMonitorSection.jsx). 404 (module/spec not installed) resolves to [].
 */
async function fetchTbaiValidationResults(apiFetch, orgId) {
  try {
    const resp = await get(apiFetch, TBAI_SPEC, TBAI_VALIDATION_ENTITY, {
      organization: orgId,
      _startRow: '0',
      _endRow: '9999',
    });
    return resp.data ?? [];
  } catch {
    return [];
  }
}

export function useFiscalMonitor(orgId, apiBaseUrl) {
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [state, setState] = useState({
    loading: true,
    error: null,
    profile: null,
    monitorData: {},
    kpis: {},
    siiParentId: null,
    tbaiValidationResults: [],
    earliestTbaiCutoverDate: null,
    earliestVerifactuCutoverDate: null,
  });

  const load = useCallback(async () => {
    if (!orgId) {
      setState({
        loading: false, error: null, profile: 'unconfigured', monitorData: {}, kpis: {},
        siiParentId: null, tbaiValidationResults: [], earliestTbaiCutoverDate: null,
        earliestVerifactuCutoverDate: null,
      });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      // TBAI and Verifactu both fetch ALL config rows (not just the active one)
      // in the same request used for profile detection — see
      // fetchAllConfigRowsSafe above — so the earliest-ever cutover date
      // (ETP-5229 #13/#17) is derived without a second round trip.
      const [siiCfg, tbaiCfgRows, vfCfgRows] = await Promise.all([
        fetchConfigRecord(apiFetch, SII_CFG_SPEC, SII_CFG_ENTITY, orgId),
        fetchAllConfigRowsSafe(apiFetch, TBAI_CFG_SPEC, TBAI_CFG_ENTITY, orgId),
        fetchAllConfigRowsSafe(apiFetch, VF_CFG_SPEC, VF_CFG_ENTITY, orgId),
      ]);
      const tbaiCfg = tbaiCfgRows.find(isActiveRecord) ?? tbaiCfgRows[0] ?? null;
      const vfCfg = vfCfgRows.find(isActiveRecord) ?? vfCfgRows[0] ?? null;
      const earliestTbaiCutoverDate = earliestCutoverDate(tbaiCfgRows, 'tbai');
      const earliestVerifactuCutoverDate = earliestCutoverDate(vfCfgRows, 'verifactu');
      // Gate on active before profile resolution (see useFiscalConfig): an
      // inactive trace row must never resolve the monitor to a configured state.
      const profile = detectProfile(activeOrNull(siiCfg), activeOrNull(tbaiCfg), activeOrNull(vfCfg));

      let monitorData = {};
      let siiParentId = null;
      let tbaiValidationResults = [];
      if (profile === 'sii' || profile === 'sii-navarra' || profile === 'sii+tbai') {
        const siiResult = await fetchSiiMonitorData(apiFetch, orgId);
        monitorData.sii = siiResult.counts;
        siiParentId = siiResult.parentId;
      }
      if (profile === 'tbai' || profile === 'sii+tbai') {
        const [tbaiCounts, tbaiValidation] = await Promise.all([
          fetchTbaiData(apiFetch, orgId, earliestTbaiCutoverDate),
          fetchTbaiValidationResults(apiFetch, orgId),
        ]);
        monitorData.tbai = tbaiCounts;
        tbaiValidationResults = tbaiValidation;
      }
      if (profile === 'verifactu') {
        // ETP-5229 #17 — Verifactu's monitor entities (facturasAceptadas/etc.,
        // backed by the etvfac_inv_sent_status_v view) now project invoiceDate
        // (see VF_DATE_FIELD above), so the same earliest-cutover lower bound
        // TBAI already got in #13 applies here too.
        monitorData.verifactu = await fetchVerifactuMonitorData(apiFetch, orgId, earliestVerifactuCutoverDate);
      }

      setState({
        loading: false,
        error: null,
        profile,
        monitorData,
        kpis: computeKpis(profile, monitorData),
        siiParentId,
        tbaiValidationResults,
        earliestTbaiCutoverDate,
        earliestVerifactuCutoverDate,
      });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [orgId, apiFetch]);

  useEffect(() => { load(); }, [load]);

  return { ...state, refetch: load };
}

// Export entity/spec constants so section components can use them
export {
  SII_SPEC, SII_EMITIDAS_ENTITY, SII_RECIBIDAS_ENTITY,
  SII_EMITIDAS_ANT_ENTITY, SII_RECIBIDAS_ANT_ENTITY,
  VF_SPEC, VF_ACEPTADAS_ENTITY, VF_PARCIAL_ENTITY,
  VF_RECHAZADAS_ENTITY, VF_INVALIDAS_ENTITY,
  TBAI_SPEC, TBAI_ENTITY, TBAI_VALIDATION_ENTITY,
};
// ETP-5229 — shared by TbaiMonitorSection.jsx / VerifactuMonitorSection.jsx so
// their list/export queries apply the SAME earliest-cutover lower bound as the
// KPI counts above (#13/#17). VF_DATE_FIELD is exported so callers don't need
// to hardcode 'invoiceDate' a second time.
export { buildCutoverCriteria, VF_DATE_FIELD };
