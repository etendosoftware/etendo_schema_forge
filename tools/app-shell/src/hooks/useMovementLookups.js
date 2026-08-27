import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';
const DEBOUNCE_MS = 200;

/**
 * Debounced lookup hook for picker-style inputs. Hits
 *   GET /sws/neo/financial-account-transactions?action={action}&q={query}
 * and exposes `{ results, loading, error }` derived from the JSON envelope's
 * `data.{resultKey}` field.
 *
 * @param {{ action: 'bpartner-lookup' | 'glitem-lookup', resultKey: 'bpartners' | 'glItems' }} cfg
 * @param {string} query — the current search text (live, debounced internally)
 */
function useDebouncedLookup({ action, resultKey, extraParams = '' }, query) {
  const { token } = useAuth();
  const apiFetch = useApiFetch();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const run = useCallback(async (q) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const path = `/sws/neo/financial-account-transactions?action=${action}&q=${encodeURIComponent(q ?? '')}${extraParams}`;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(path, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setResults(json?.response?.data?.[resultKey] ?? []);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err);
    } finally {
      setLoading(false);
    }
  }, [action, resultKey, extraParams, apiFetch]);

  useEffect(() => {
    if (!token) return undefined;
    const id = setTimeout(() => { run(query); }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query, run, token]);

  return { results, loading, error };
}

/**
 * Lookup over C_BPartner, optionally filtered by role.
 * @param {string} query - the search text
 * @param {'customer'|'vendor'|''} [role] - filter by iscustomer/isvendor
 */
export function useBPartnerLookup(query, role = '') {
  return useDebouncedLookup(
    { action: 'bpartner-lookup', resultKey: 'bpartners', extraParams: role ? `&role=${role}` : '' },
    query,
  );
}

export function useGLItemLookup(query) {
  return useDebouncedLookup(
    { action: 'glitem-lookup', resultKey: 'glItems' },
    query,
  );
}

/**
 * Server-side searchable lookup over an accounting dimension (project,
 * costcenter, product, …), backed by the same `dimension-values` action the
 * dimension selects use — but filtered by `q` so it feeds a searchable picker.
 *
 * @param {string} query - the search text
 * @param {string} dimension - dimension key (e.g. 'project', 'costcenter', 'product')
 */
export function useDimensionLookup(query, dimension) {
  return useDebouncedLookup(
    { action: 'dimension-values', resultKey: 'values', extraParams: `&dimension=${encodeURIComponent(dimension)}` },
    query,
  );
}

/**
 * Outstanding (unpaid) invoices for a business partner, filtered by direction:
 *   doc='in'  → sales invoices    (receivables / cobro)
 *   doc='out' → purchase invoices (payables / pago)
 * Re-fetches whenever the partner or direction changes. When no partner is
 * given it returns the invoices of ALL contacts (so a payment can be allocated
 * to any of them). Shape per row matches the payment invoice table (id, no, bp,
 * desc, fecha, venc, dias, metodo, proyecto, cc, mon, total, expected, pend).
 *
 * @param {string|null} bpartnerId - selected C_BPartner id (the payment tercero), or null for all
 * @param {'in'|'out'} [doc] - cobro vs pago
 */
export function useOutstandingInvoices(bpartnerId, doc = 'in') {
  const { token } = useAuth();
  const apiFetch = useApiFetch();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!token) { setInvoices([]); setLoading(false); return undefined; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // A blank bpartnerId returns invoices of all contacts (the backend treats it
    // as "no partner scope"), so a payment can be allocated to any contact.
    const path = `/sws/neo/financial-account-transactions?action=outstanding-invoices`
      + `&bpartnerId=${encodeURIComponent(bpartnerId ?? '')}&doc=${doc === 'out' ? 'out' : 'in'}`;
    setLoading(true);
    setError(null);
    apiFetch(path, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
        return res.json();
      })
      .then((json) => { if (!ctrl.signal.aborted) setInvoices(json?.response?.data?.invoices ?? []); })
      .catch((err) => { if (err.name !== 'AbortError') setError(err); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });

    return () => ctrl.abort();
  }, [bpartnerId, doc, apiFetch, token]);

  return { invoices, loading, error };
}
