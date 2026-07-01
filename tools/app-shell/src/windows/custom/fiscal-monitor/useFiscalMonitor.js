import { useState, useEffect, useCallback } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { detectProfile } from '../fiscal-config/fiscalConfig.utils.js';
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

// ── TBAI entity name ──────────────────────────────────────────────────────────
const TBAI_SPEC   = 'tbai-facturas-enviadas';
const TBAI_ENTITY = 'sincronización';
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
    const resp = await get(apiFetch, spec, entity, { organization: orgId, _limit: '1' });
    return resp.data?.[0] ?? null;
  } catch {
    // 404 = spec/module not installed for this org → treat as not configured
    return null;
  }
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
  const resp = await get(apiFetch, SII_SPEC, 'organizations', { organization: orgId, _limit: '1' });
  const row = resp.data?.[0];
  if (!row) return null;
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

async function fetchVerifactuMonitorData(apiFetch, orgId) {
  // The monitor-verifactu child tabs filter only by verifactuSendingStatus (HQL fixed to
  // not include @AD_Org_id@). OBDal/OBQuery applies org visibility automatically from the
  // JWT context, so passing _org is sufficient for scoping.
  const vfParams = { _org: orgId };
  const [accepted, partial, rejected, invalid] = await Promise.all([
    fetchCount(apiFetch, VF_SPEC, VF_ACEPTADAS_ENTITY,  vfParams),
    fetchCount(apiFetch, VF_SPEC, VF_PARCIAL_ENTITY,    vfParams),
    fetchCount(apiFetch, VF_SPEC, VF_RECHAZADAS_ENTITY, vfParams),
    fetchCount(apiFetch, VF_SPEC, VF_INVALIDAS_ENTITY,  vfParams),
  ]);
  return { accepted, partiallyAccepted: partial, rejected, invalid };
}

async function fetchCountByCriteria(apiFetch, spec, entity, orgId, field, value) {
  const params = {
    organization: orgId,
    _limit: '1',
    criteria: JSON.stringify([{ fieldName: field, operator: 'equals', value }]),
  };
  const resp = await get(apiFetch, spec, entity, params);
  return resp.totalRows ?? 0;
}

async function fetchTbaiData(apiFetch, orgId) {
  const [total, received, rejected, error, pending] = await Promise.all([
    get(apiFetch, TBAI_SPEC, TBAI_ENTITY, { organization: orgId, _limit: '1' })
      .then(r => r.totalRows ?? 0),
    fetchCountByCriteria(apiFetch, TBAI_SPEC, TBAI_ENTITY, orgId, 'estado', 'Recibido'),
    fetchCountByCriteria(apiFetch, TBAI_SPEC, TBAI_ENTITY, orgId, 'estado', 'Rechazado'),
    fetchCountByCriteria(apiFetch, TBAI_SPEC, TBAI_ENTITY, orgId, 'estado', 'Error'),
    fetchCountByCriteria(apiFetch, TBAI_SPEC, TBAI_ENTITY, orgId, 'estado', 'Pendiente'),
  ]);
  return { totalCount: total, receivedCount: received, rejectedCount: rejected, errorCount: error, pendingCount: pending };
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
  });

  const load = useCallback(async () => {
    if (!orgId) {
      setState({ loading: false, error: null, profile: 'unconfigured', monitorData: {}, kpis: {}, siiParentId: null });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [siiCfg, tbaiCfg, vfCfg] = await Promise.all([
        fetchConfigRecord(apiFetch, SII_CFG_SPEC,  SII_CFG_ENTITY,  orgId),
        fetchConfigRecord(apiFetch, TBAI_CFG_SPEC, TBAI_CFG_ENTITY, orgId),
        fetchConfigRecord(apiFetch, VF_CFG_SPEC,   VF_CFG_ENTITY,   orgId),
      ]);
      const profile = detectProfile(siiCfg, tbaiCfg, vfCfg);

      let monitorData = {};
      let siiParentId = null;
      if (profile === 'sii' || profile === 'sii-navarra' || profile === 'sii+tbai') {
        const siiResult = await fetchSiiMonitorData(apiFetch, orgId);
        monitorData.sii = siiResult.counts;
        siiParentId = siiResult.parentId;
      }
      if (profile === 'tbai' || profile === 'sii+tbai') {
        monitorData.tbai = await fetchTbaiData(apiFetch, orgId);
      }
      if (profile === 'verifactu') {
        monitorData.verifactu = await fetchVerifactuMonitorData(apiFetch, orgId);
      }

      setState({
        loading: false,
        error: null,
        profile,
        monitorData,
        kpis: computeKpis(profile, monitorData),
        siiParentId,
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
  TBAI_SPEC, TBAI_ENTITY,
};
