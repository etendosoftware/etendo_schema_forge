import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource';

/**
 * Fetches the selectable values for a set of accounting dimensions from
 *   GET /sws/neo/financial-account-transactions?action=dimension-values&dimension=<key>
 * (powered by FinancialAccountTransactionsHandler). Returns an `{ [key]: [{ id, name }] }`
 * map plus a `loading` flag. Used by the New Movement wizard to populate the
 * dimension selects with real data instead of hardcoded option lists.
 *
 * @param {string[]} dimensions - dimension keys to fetch (e.g. ['organization'])
 * @param {boolean} [enabled=true] - skip fetching while false (e.g. modal closed)
 */
export function useDimensionValues(dimensions, enabled = true) {
  const { token } = useAuth();
  const [optionsByDim, setOptionsByDim] = useState({});
  const [loading, setLoading] = useState(false);

  // Stable key so the effect only re-runs when the dimension set changes.
  const dimKey = useMemo(() => (dimensions || []).join(','), [dimensions]);

  useEffect(() => {
    const keys = dimKey ? dimKey.split(',') : [];
    if (!enabled || !token || keys.length === 0) {
      setOptionsByDim({});
      return undefined;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const base = getApiBase();
    setLoading(true);

    Promise.all(keys.map(async (key) => {
      const url = `${base}/sws/neo/financial-account-transactions?action=dimension-values&dimension=${encodeURIComponent(key)}`;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          signal: ctrl.signal,
        });
        if (!res.ok) return [key, []];
        const json = await res.json();
        const values = json?.response?.data?.values;
        return [key, Array.isArray(values) ? values : []];
      } catch {
        return [key, []];
      }
    })).then((entries) => {
      if (!cancelled) {
        setOptionsByDim(Object.fromEntries(entries));
        setLoading(false);
      }
    });

    return () => { cancelled = true; ctrl.abort(); };
  }, [dimKey, enabled, token]);

  return { optionsByDim, loading };
}
