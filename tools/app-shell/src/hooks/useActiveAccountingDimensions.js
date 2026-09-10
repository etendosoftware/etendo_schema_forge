import { useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';

/**
 * Reads the accounting dimensions available at a document header for the current tenant:
 *
 *   GET {apiBaseUrl}/{entity}?action=activeDimensions
 *     → MatchRuleHandler.buildActiveDimensions() (com.etendoerp.go)
 *     → AccountingDimensionsSupport.activeHeaderDimensionsForCurrentClient("FAT")
 *
 * The backend picks the right source of truth depending on
 * `AD_Client.Acctdim_Centrally_Maintained` — `C_AcctSchema_Element` for a per-ledger setup, the
 * `AD_Client`/`AD_Client_AcctDimension` matrix for a centrally-maintained one — so callers never
 * have to know which of the two is authoritative.
 *
 * Returns `null` until (and unless) the answer is known, which every consumer must read as "do not
 * filter anything yet": see `filterByActiveDimensions` in `@/lib/accountingDimensions.js`.
 *
 * @param entity - the ETGO_SF_ENTITY name to ask about (e.g. 'etgoMatchRuleHeader')
 * @param opts.apiBaseUrl - spec base URL, passed straight to useApiFetch
 * @param opts.enabled - set false to skip the request entirely (no dimension fields to gate)
 * @returns the active dimension keys (e.g. ['project', 'product']), or null when unknown
 */
export function useActiveAccountingDimensions(entity, { apiBaseUrl, enabled = true } = {}) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [dimensions, setDimensions] = useState(null);

  useEffect(() => {
    if (!enabled || !entity) {
      setDimensions(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/${entity}?action=activeDimensions`);
        if (!res.ok) return; // fail open — keep every field visible
        const json = await res.json();
        const list = json?.response?.data?.dimensions;
        if (!cancelled && Array.isArray(list)) setDimensions(list);
      } catch {
        /* fail open — the form stays fully visible */
      }
    })();
    return () => { cancelled = true; };
  }, [apiFetch, entity, enabled]);

  return dimensions;
}
