import { useState, useEffect, useCallback } from 'react';

/**
 * Fetch data from a NEO Headless widget endpoint.
 *
 * @param {string} specName  Widget spec name (e.g. 'widget-kpis')
 * @param {{ token: string, apiBaseUrl: string }} opts
 * @returns {{ data: any, loading: boolean, error: string|null, refresh: () => void }}
 */
export function useWidget(specName, { token, apiBaseUrl }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    if (!token || !apiBaseUrl) return;
    setLoading(true);
    setError(null);
    fetch(`${apiBaseUrl}/${specName}/data`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(json => {
        setData(json?.response?.data ?? null);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiBaseUrl, specName, token]);

  useEffect(() => {
    if (token) refresh();
  }, [refresh, token]);

  return { data, loading, error, refresh };
}
