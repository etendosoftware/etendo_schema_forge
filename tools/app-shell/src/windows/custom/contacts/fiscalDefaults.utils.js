import { useState, useEffect } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { isActiveRecord, isEtendoTrue } from '../fiscal-config/fiscalConfig.utils.js';

// ── Config entity names (same fiscal-config specs used by the Monitor Fiscal
// / Fiscal Config windows — see useFiscalMonitor.js / fiscalConfig.utils.js) ──
const SII_CFG_SPEC = 'sii-config';
const SII_CFG_ENTITY = 'siiConfiguration';
const TBAI_CFG_SPEC = 'tbai-config';
const TBAI_CFG_ENTITY = 'header';

/**
 * Resolves a Business Partner FK-style field (raw UUID, `{id}` object, or
 * mock `{id, name}`) down to a plain string id, or null.
 */
export function resolveOrganizationId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value.id ?? value.value ?? null;
    return id == null || id === '' ? null : String(id);
  }
  return String(value);
}

async function fetchActiveConfigRecord(apiFetch, spec, entity, orgId) {
  try {
    // NEO reads with NO_ACTIVE_FILTER=true; prefer the active row so a
    // deactivated ("Change SIF") trace row never masks a live config —
    // same pattern as fetchConfigRecord() in useFiscalMonitor.js.
    const url = `/${spec}/${encodeURIComponent(entity)}?${new URLSearchParams({ organization: orgId, _limit: '10' })}`;
    const res = await apiFetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    const rows = body?.response?.data ?? [];
    if (rows.length === 0) return null;
    return rows.find(isActiveRecord) ?? rows[0];
  } catch {
    // Network error / 404 (spec not installed for this org) → not configured.
    return null;
  }
}

/**
 * Detects whether SII and/or TicketBAI are actively configured for the given
 * Business Partner organization, so `FiscalDefaultsSection` can show only
 * the sub-block(s) that apply.
 *
 * - SII "active": an active `sii-config/siiConfiguration` record exists for
 *   the org AND its `acogidaAlSII` flag is truthy.
 * - TicketBAI "active": the mere EXISTENCE of an active `tbai-config/header`
 *   record for the org — there is no boolean flag, presence is the signal.
 *
 * Fail-safe: any fetch error, missing connectivity, or 404 (module not
 * installed) degrades to `false` for that system — hide the block rather
 * than show broken or incorrect data, mirroring the non-fatal degradation
 * pattern already used by `useFiscalMonitor.js`.
 */
export function useSiiTbaiActive(organizationId, apiBaseUrl) {
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [state, setState] = useState({ loading: true, sii: false, tbai: false });

  useEffect(() => {
    let cancelled = false;

    if (!organizationId) {
      setState({ loading: false, sii: false, tbai: false });
      return undefined;
    }

    setState((s) => ({ ...s, loading: true }));

    (async () => {
      const [siiRecord, tbaiRecord] = await Promise.all([
        fetchActiveConfigRecord(apiFetch, SII_CFG_SPEC, SII_CFG_ENTITY, organizationId),
        fetchActiveConfigRecord(apiFetch, TBAI_CFG_SPEC, TBAI_CFG_ENTITY, organizationId),
      ]);
      if (cancelled) return;
      setState({
        loading: false,
        sii: !!siiRecord && isEtendoTrue(siiRecord.acogidaAlSII),
        tbai: !!tbaiRecord,
      });
    })().catch(() => {
      if (!cancelled) setState({ loading: false, sii: false, tbai: false });
    });

    return () => {
      cancelled = true;
    };
  }, [organizationId, apiFetch]);

  return state;
}
