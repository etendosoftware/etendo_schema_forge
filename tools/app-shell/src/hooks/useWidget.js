import { useState, useEffect, useCallback } from 'react';
import { jsonHeaders } from '@/lib/sessionHeaders.js';

/**
 * Fetch data from a NEO Headless widget endpoint.
 *
 * @param {string} specName  Widget spec name (e.g. 'widget-kpis')
 * @param {{ apiBaseUrl: string }} opts
 * @returns {{ data: any, loading: boolean, error: string|null, refresh: () => void }}
 */
export function useWidget(specName, { apiBaseUrl }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    if (!apiBaseUrl) return;
    setLoading(true);
    setError(null);
    fetch(`${apiBaseUrl}/${specName}/data`, {
      credentials: 'include',
      headers: jsonHeaders(),
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
  }, [apiBaseUrl, specName]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
