import { useCallback, useEffect, useRef, useState } from 'react';
import { filterByKey, PAGE_SIZE, withAllCount } from './invoiceInboxFilters.js';
import { fetchCounts, fetchNextPage } from './invoiceInboxApi.js';

/**
 * Appends a page, skipping rows already on screen. Pages are offset-based: a document uploaded
 * (or a status that changed) between two pages shifts the offsets, so the next page can repeat a
 * row the previous one already brought.
 */
export function appendNewRows(prev, next) {
  const seen = new Set(prev.map((row) => row.id));
  return [...prev, ...next.filter((row) => !seen.has(row.id))];
}

const START_CURSOR = Object.freeze({ index: 0, offset: 0 });

function isAbort(err) {
  return err?.name === 'AbortError';
}

/**
 * ETP-6049 — the counters of every filter tab. `counts` stays null until the first answer, so
 * the tabs show no number instead of a misleading 0.
 */
function useInboxCounts(apiFetch) {
  const [counts, setCounts] = useState(null);
  const abortRef = useRef(null);

  const reloadCounts = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const next = await fetchCounts(apiFetch, ctrl.signal);
      if (abortRef.current === ctrl) setCounts(withAllCount(next));
    } catch {
      // A failed count keeps the previous numbers (or none): the list reports load errors.
    }
  }, [apiFetch]);

  useEffect(() => () => abortRef.current?.abort(), []);
  return { counts, reloadCounts };
}

/**
 * ETP-6049 — the paged rows of the active filter, plus the counters.
 *
 * A filter change (or `reload`) restarts from the first page; `loadMore` appends the next one.
 * `replaceRows` swaps rows in place (the PROCESSING poll), keeping their position: a row that
 * no longer matches the filter stays visible until the next explicit reload, so the table never
 * jumps under the cursor.
 *
 * @param {Function} apiFetch from `useApiFetch(apiBaseUrl)`
 * @param {string} filterKey
 */
export function useInvoiceInboxList(apiFetch, filterKey) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef(START_CURSOR);
  const abortRef = useRef(null);
  const { counts, reloadCounts } = useInboxCounts(apiFetch);

  const loadPage = useCallback(async (reset) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const cursor = reset ? START_CURSOR : cursorRef.current;
    setLoading(true);
    setLoadError(false);
    try {
      const page = await fetchNextPage(apiFetch, filterByKey(filterKey).streams, cursor, PAGE_SIZE, ctrl.signal);
      if (abortRef.current !== ctrl) return;
      cursorRef.current = page.cursor;
      setRows((prev) => (reset ? page.rows : appendNewRows(prev, page.rows)));
      setHasMore(page.more);
    } catch (err) {
      if (isAbort(err) || abortRef.current !== ctrl) return;
      setLoadError(true);
      if (reset) setRows([]);
    } finally {
      if (abortRef.current === ctrl) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [apiFetch, filterKey]);

  const reload = useCallback(() => {
    loadPage(true);
    reloadCounts();
  }, [loadPage, reloadCounts]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) loadPage(false);
  }, [loading, hasMore, loadPage]);

  const replaceRows = useCallback((fresh) => {
    if (!fresh?.length) return;
    const byId = new Map(fresh.map((row) => [row.id, row]));
    setRows((prev) => prev.map((row) => byId.get(row.id) ?? row));
  }, []);

  // A filter change restarts the list. Counters do not depend on the filter.
  useEffect(() => {
    loadPage(true);
  }, [loadPage]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- counters load once, then on reload
  useEffect(() => { reloadCounts(); }, [apiFetch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { rows, loading, loaded, loadError, hasMore, loadMore, reload, reloadCounts, replaceRows, counts };
}
