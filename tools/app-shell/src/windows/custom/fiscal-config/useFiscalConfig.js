import { useState, useEffect, useCallback } from 'react';
import { detectProfile, activeOrNull, isActiveRecord } from './fiscalConfig.utils.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

// Confirmed from artifacts/*/contract.json → backendContract.window.primaryEntity
const SII_ENTITY = 'siiConfiguration';
const TBAI_ENTITY = 'header';
const VERIFACTU_ENTITY = 'cabeceraDeConfiguraciónVerifactu';

async function fetchRecord(apiFetch, specName, entityName, orgId) {
  // NEO reads with NO_ACTIVE_FILTER=true, so an org can carry an inactive
  // ("Change SIF") trace row alongside a live one. Pull a small page and prefer
  // the active row rather than blindly taking the first, so a leftover trace
  // never masks a real active config.
  const params = new URLSearchParams({ organization: orgId, _limit: '10' });
  const res = await apiFetch(`/${specName}/${entityName}?${params}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to load ${specName}: HTTP ${res.status}`);
  const json = await res.json();
  const rows = json?.response?.data ?? [];
  if (rows.length === 0) return null;
  return rows.find(isActiveRecord) ?? rows[0];
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
  });

  const load = useCallback(async () => {
    if (!orgId) {
      setState({ loading: false, error: null, profile: 'unconfigured', siiRecord: null, tbaiRecord: null, verifactuRecord: null });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      // NEO reads with NO_ACTIVE_FILTER=true, so a deactivated ("Change SIF")
      // trace row can come back — drop inactive rows before resolving the profile.
      const [siiRaw, tbaiRaw, verifactuRaw] = await Promise.all([
        fetchRecord(apiFetch, 'sii-config', SII_ENTITY, orgId),
        fetchRecord(apiFetch, 'tbai-config', TBAI_ENTITY, orgId),
        fetchRecord(apiFetch, 'verifactu-config', VERIFACTU_ENTITY, orgId),
      ]);
      const sii = activeOrNull(siiRaw);
      const tbai = activeOrNull(tbaiRaw);
      const verifactu = activeOrNull(verifactuRaw);
      setState({
        loading: false,
        error: null,
        siiRecord: sii,
        tbaiRecord: tbai,
        verifactuRecord: verifactu,
        profile: detectProfile(sii, tbai, verifactu),
      });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [orgId, apiFetch]);

  useEffect(() => { load(); }, [load]);

  return { ...state, refetch: load };
}
