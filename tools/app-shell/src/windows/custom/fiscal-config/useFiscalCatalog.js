import { useState, useEffect } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { fetchFiscalCatalog } from './fiscalSystemApi.js';

/**
 * The territory × system rules of the Fiscal Configuration window, read from the backend
 * (`fiscalSystemCatalog`, ETP-6053). `catalog` is null while loading and when the read fails;
 * `error` then carries the failure message.
 *
 * @param {string} apiBaseUrl
 * @param {string|null} orgId
 * @returns {{ catalog: object|null, error: string|null, loading: boolean }}
 */
export function useFiscalCatalog(apiBaseUrl, orgId) {
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [state, setState] = useState({ catalog: null, error: null, loading: false });

  useEffect(() => {
    if (!apiBaseUrl || !orgId) {
      setState({ catalog: null, error: null, loading: false });
      return undefined;
    }
    const controller = new AbortController();
    setState(s => ({ ...s, loading: true, error: null }));
    fetchFiscalCatalog(apiFetch, orgId, { signal: controller.signal })
      .then(catalog => {
        if (!controller.signal.aborted) setState({ catalog, error: null, loading: false });
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setState({ catalog: null, error: err?.message ?? String(err), loading: false });
        }
      });
    return () => controller.abort();
  }, [apiFetch, apiBaseUrl, orgId]);

  return state;
}
