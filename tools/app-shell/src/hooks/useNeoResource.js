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
async function fetchNeoPayload(apiBase, path, signal) {
  const url = `${apiBase}${path}`;
  // ETP-4576 — authenticates with the `__Host-` session cookie instead of a
  // bearer token, and opts into sending it explicitly rather than relying on
  // fetch's `same-origin` default: every other migrated caller does the same,
  // and it keeps working if the app is ever served from a different origin than
  // the API. These are GETs, so no CSRF proof is required.
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
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
  const { isAuthenticated } = useAuth();
  const apiBase = useMemo(() => getApiBase(), []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !path) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchNeoPayload(apiBase, path, ctrl.signal);
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
  }, [apiBase, isAuthenticated, path, timeoutMs, label, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
