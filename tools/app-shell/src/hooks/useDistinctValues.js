import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { buildHeaders } from '@/auth/api.js';

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_DEBOUNCE_MS = 250;

/**
 * Paginated distinct-value fetcher for a single field of a NEO Headless list
 * entity. Backed by `GET /sws/neo/{entity}?_distinct=<field>&_distinctSearch=…
 * &_startRow=…&_endRow=…`.
 *
 * UX pattern this hook enables:
 *   1. Caller shows whatever values it already has in memory for instant feedback.
 *   2. On mount / when `enabled` flips true, this hook fetches page 1 in the
 *      background. `loading` stays true until the first page resolves.
 *   3. As the user scrolls to the bottom of the dropdown, the caller invokes
 *      `loadMore()` to append the next page.
 *   4. Typing in the search box updates `search`; it is debounced internally
 *      and resets the pagination cursor.
 *
 * No caching: every time the dropdown opens we refetch. This keeps the values
 * fresh across edits elsewhere in the app (the alternative — a module-scope
 * Map — was considered and explicitly deferred).
 */
export function useDistinctValues(entity, field, {
  enabled = true,
  pageSize = DEFAULT_PAGE_SIZE,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  apiBaseUrl,
} = {}) {
  const { token } = useAuth();
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [rawSearch, setRawSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const startRowRef = useRef(0);
  // Each fetch owns a monotonic sequence number; stale responses are dropped.
  const requestIdRef = useRef(0);

  // Debounce the search input so each keystroke doesn't trigger a round-trip.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(rawSearch.trim()), debounceMs);
    return () => clearTimeout(t);
  }, [rawSearch, debounceMs]);

  const buildUrl = useCallback((startRow, endRow, search) => {
    const params = new URLSearchParams();
    params.set('_distinct', field);
    params.set('_startRow', String(startRow));
    params.set('_endRow', String(endRow));
    if (search) params.set('_distinctSearch', search);
    return `${apiBaseUrl}/${encodeURIComponent(entity)}?${params.toString()}`;
  }, [apiBaseUrl, entity, field]);

  const fetchPage = useCallback(async (startRow, search, append) => {
    if (!token || !entity || !field || !apiBaseUrl) return;
    const reqId = ++requestIdRef.current;
    const setBusy = append ? setLoadingMore : setLoading;
    setBusy(true);
    setError(null);
    try {
      const endRow = startRow + pageSize - 1;
      const res = await fetch(buildUrl(startRow, endRow, search), {
        headers: buildHeaders(token),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (reqId !== requestIdRef.current) return; // superseded
      const rawPage = Array.isArray(data?.response?.data) ? data.response.data : [];
      // Normalize to {id, _identifier} so consumers never branch on scalar vs
      // FK backends. Scalar strings become objects with id === _identifier.
      const page = rawPage.map((entry) => {
        if (entry && typeof entry === 'object' && 'id' in entry) {
          return {
            id: entry.id ?? '',
            _identifier: entry._identifier ?? entry.id ?? '',
          };
        }
        const s = entry == null ? '' : String(entry);
        return { id: s, _identifier: s };
      });
      const more = !!data?.response?.hasMore;
      setValues(prev => (append ? [...prev, ...page] : page));
      setHasMore(more);
      startRowRef.current = startRow + page.length;
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      setError(e);
      if (!append) setValues([]);
      setHasMore(false);
    } finally {
      if (reqId === requestIdRef.current) setBusy(false);
    }
  }, [token, entity, field, pageSize, buildUrl]);

  // Reset + fetch page 1 whenever the query key changes.
  useEffect(() => {
    if (!enabled || !token || !entity || !field || !apiBaseUrl) {
      setValues([]);
      setHasMore(false);
      return;
    }
    startRowRef.current = 0;
    fetchPage(0, debouncedSearch, false);
  }, [enabled, token, entity, field, apiBaseUrl, debouncedSearch, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    fetchPage(startRowRef.current, debouncedSearch, true);
  }, [hasMore, loading, loadingMore, fetchPage, debouncedSearch]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    startRowRef.current = 0;
    fetchPage(0, debouncedSearch, false);
  }, [enabled, fetchPage, debouncedSearch]);

  return useMemo(() => ({
    values,
    loading,
    loadingMore,
    hasMore,
    error,
    search: rawSearch,
    setSearch: setRawSearch,
    loadMore,
    refresh,
  }), [values, loading, loadingMore, hasMore, error, rawSearch, loadMore, refresh]);
}

export default useDistinctValues;
