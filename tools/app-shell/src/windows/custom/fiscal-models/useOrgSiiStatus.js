// Is the selected organization in the SII? (ETP-5716) — read by the model catalog before it
// activates a model whose registry entry sets `siiWarningOnActivate` (the annual VAT summary:
// entities in the SII are exempt from filing it, so activating it asks for confirmation).
//
// Source: the organization's SII configuration — the same NEO entity the fiscal-config window
// reads (`sii-config/siiConfiguration`, `aeatsii_config`, see fiscal-config/useFiscalConfig.js).
// NEO serves inactive "Change SIF" trace rows too, so only an ACTIVE row counts (shared
// `isActiveRecord`), and a row explicitly marked out of the SII (`acogidaAlSII = 'N'`) does not.
//
// Any failure (no organization, no SII module, network) resolves `false`: the warning is a
// courtesy, never a gate, so "unknown" means "do not warn".
import { useEffect, useRef } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useAuthOptional } from '@/auth/AuthContext.jsx';
import { neoBase } from '@/components/related-documents/helpers.js';
import { isActiveRecord, isEtendoFalse } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';

/** True when `rows` (SII configuration records of one organization) hold an active SII config. */
export function hasActiveSiiConfig(rows) {
  return (Array.isArray(rows) ? rows : []).some(r => isActiveRecord(r) && !isEtendoFalse(r?.acogidaAlSII));
}

/** Resolves whether `orgId` has an active SII configuration; `false` on any failure. */
export async function fetchOrgSiiActive(apiFetch, apiBaseUrl, orgId) {
  if (!apiBaseUrl || !orgId) return false;
  try {
    const params = new URLSearchParams({ organization: orgId, _limit: '50' });
    const res = await apiFetch(`${neoBase(apiBaseUrl)}/sii-config/siiConfiguration?${params}`, { baseUrl: '' });
    if (!res.ok) return false;
    const json = await res.json();
    return hasActiveSiiConfig(json?.response?.data);
  } catch (_) {
    return false;
  }
}

/**
 * Returns `getSiiActive()` → Promise<boolean> for the selected organization. Fetched once, lazily
 * (only when `enabled`), and memoised for the lifetime of the component.
 */
export default function useOrgSiiStatus({ apiBaseUrl, enabled = true }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const auth = useAuthOptional();
  const orgId = auth?.selectedOrg?.id ?? null;
  const promiseRef = useRef(null);

  useEffect(() => { promiseRef.current = null; }, [orgId, apiBaseUrl]);

  return function getSiiActive() {
    if (!enabled) return Promise.resolve(false);
    if (!promiseRef.current) promiseRef.current = fetchOrgSiiActive(apiFetch, apiBaseUrl, orgId);
    return promiseRef.current;
  };
}
