import { useState, useEffect } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { fetchFiscalCatalog, isFiscalAccessDenied } from './fiscalSystemApi.js';

/**
 * The territory × system rules of the Fiscal Configuration window, read from the backend
 * (`fiscalSystemCatalog`, ETP-6053). `catalog` is null while loading and when the read fails;
 * `error` then carries the failure message, and `forbidden` is true when the role may not read it
 * at all (the caller shows its own translated message, never the server's raw denial).
 *
 * @param {string} apiBaseUrl
 * @param {string|null} orgId
 * @returns {{ catalog: object|null, error: string|null, forbidden: boolean, loading: boolean }}
 */
export function useFiscalCatalog(apiBaseUrl, orgId) {
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [state, setState] = useState({ catalog: null, error: null, forbidden: false, loading: false });

  useEffect(() => {
    if (!apiBaseUrl || !orgId) {
      setState({ catalog: null, error: null, forbidden: false, loading: false });
      return undefined;
    }
    const controller = new AbortController();
    setState(s => ({ ...s, loading: true, error: null, forbidden: false }));
    fetchFiscalCatalog(apiFetch, orgId, { signal: controller.signal })
      .then(catalog => {
        if (!controller.signal.aborted) setState({ catalog, error: null, forbidden: false, loading: false });
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setState({
            catalog: null, error: err?.message ?? String(err), forbidden: isFiscalAccessDenied(err), loading: false,
          });
        }
      });
    return () => controller.abort();
  }, [apiFetch, apiBaseUrl, orgId]);

  return state;
}
