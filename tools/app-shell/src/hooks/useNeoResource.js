import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Computes the API base path. When the app is served under `/web/...`, we strip
 * `/web/...` and use the prefix. Otherwise falls back to `VITE_API_BASE`.
 */
export function getApiBase() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx === -1) return import.meta.env.VITE_API_BASE || '';
  return path.substring(0, webIdx);
}

/**
 * Fetches a NEO endpoint with auth, abort signal, and JSON parsing. Returns
 * the inner `response.data` payload, or throws if the shape is invalid.
 */
async function fetchNeoPayload(apiBase, token, path, signal) {
  const url = `${apiBase}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const data = json?.response?.data;
  if (!data) throw new Error(`Unexpected response shape from ${path}`);
  return data;
}

/**
 * Generic hook that fetches a NEO endpoint with auth + abort + timeout and
 * exposes `{ data, loading, error, reload }`.
 *
 * Each call site provides:
 *   - `path`: endpoint path relative to the API base. If null/empty the hook
 *     stays idle (no fetch) — useful when the path depends on a not-yet-known
 *     id.
 *   - `deps`: extra dependencies that should trigger a refetch (e.g. accountId).
 *   - `mapPayload(raw)`: shapes the raw `response.data` into whatever the
 *     consumer wants to expose. Optional.
 *   - `timeoutMs`: overrides the default timeout.
 *
 * @template T
 * @param {{
 *   path: string|null;
 *   deps?: any[];
 *   mapPayload?: (raw: any) => T;
 *   timeoutMs?: number;
 *   label?: string;
 * }} options
 * @returns {{ data: T|null, loading: boolean, error: Error|null, reload: () => void }}
 */
export function useNeoResource({ path, deps = [], mapPayload, timeoutMs = DEFAULT_TIMEOUT_MS, label = 'useNeoResource' }) {
  const { token } = useAuth();
  const apiBase = useMemo(() => getApiBase(), []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token || !path) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchNeoPayload(apiBase, token, path, ctrl.signal);
      setData(mapPayload ? mapPayload(raw) : raw);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn(`[${label}] failed to load:`, err.message);
        setError(err);
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, token, path, timeoutMs, label, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
