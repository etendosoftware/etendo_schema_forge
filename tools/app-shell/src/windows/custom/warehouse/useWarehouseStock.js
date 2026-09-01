import { useState, useEffect } from 'react';
import { aggregateProducts } from './warehouseUtils';
import { useApiFetch } from '@/auth/useApiFetch.js';

async function fetchJson(apiFetch, path, token) {
  const res = await apiFetch(path, { token });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  return json?.response?.data ?? json?.data ?? [];
}

/** Fetch translated UoM names from C_UOM_TRL via the binContents selector. */
async function fetchUomNames(apiFetch, token) {
  try {
    const data = await fetchJson(apiFetch, '/binContents/selectors/uOM?_startRow=0&_endRow=500', token);
    const map = {};
    for (const item of data) {
      if (item.id) map[item.id] = item.identifier ?? item.name ?? item.id;
    }
    return map;
  } catch {
    return {};
  }
}

export { aggregateProducts } from './warehouseUtils';

/**
 * Fetch all storageBins for a warehouse, then aggregate binContents + productTransactions
 * across all bins in parallel. Also resolves UoM names from C_UOM_TRL via the selector.
 * Returns { loading, error, products, transactions }.
 */
export function useWarehouseStock(warehouseId, token, apiBaseUrl, refreshKey = 0) {
  const [state, setState] = useState({ loading: true, error: null, products: [], transactions: [] });
  const apiFetch = useApiFetch(apiBaseUrl);

  useEffect(() => {
    // No saved warehouse yet: there is no stock to load, so drop out of the
    // loading state and show a neutral/empty section instead of an endless spinner.
    if (!warehouseId) {
      setState({ loading: false, error: null, products: [], transactions: [] });
      return;
    }
    let cancelled = false;
    setState({ loading: true, error: null, products: [], transactions: [] });

    (async () => {
      try {
        const [bins, uomMap] = await Promise.all([
          fetchJson(apiFetch, `/storageBin?parentId=${warehouseId}&_startRow=0&_endRow=100`, token),
          fetchUomNames(apiFetch, token),
        ]);

        if (bins.length === 0) {
          if (!cancelled) setState({ loading: false, error: null, products: [], transactions: [] });
          return;
        }

        const [allContents, allTxs] = await Promise.all([
          Promise.all(bins.map(b =>
            fetchJson(apiFetch, `/binContents?parentId=${b.id}&_startRow=0&_endRow=1000`, token)
          )).then(results => results.flat()),
          Promise.all(bins.map(b =>
            fetchJson(apiFetch, `/productTransactions?parentId=${b.id}&_startRow=0&_endRow=2000`, token)
          )).then(results => results.flat()),
        ]);

        if (!cancelled) setState({
          loading: false,
          error: null,
          products: aggregateProducts(allContents, uomMap),
          transactions: allTxs,
        });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e.message, products: [], transactions: [] });
      }
    })();

    return () => { cancelled = true; };
  }, [warehouseId, token, apiFetch, refreshKey]);

  return state;
}
