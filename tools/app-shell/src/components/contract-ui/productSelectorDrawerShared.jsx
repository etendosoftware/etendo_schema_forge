/**
 * Shared primitives for product-selector drawers (GoodsMovements + InternalConsumption +
 * ProductSearchDrawer).
 * Exports: COLORS, getColor, Avatar, formatQty, useProductSelectorFetch.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';

const PAGE_SIZE = 30;

export const COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
];

export function getColor(id) {
  let hash = 0;
  for (let i = 0; i < (id || '').length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Avatar({ name, id }) {
  const initial = (name || '?')[0].toUpperCase();
  return (
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 ${getColor(id)}`}>
      {initial}
    </div>
  );
}

export function formatQty(raw) {
  if (raw == null || raw === '' || raw === 'null') return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  return n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Encapsulates the fetch state and side-effects shared by all three product-selector drawers.
 *
 * @param {object}   options
 * @param {boolean}  options.open             - Whether the drawer is open.
 * @param {string}   options.selectorUrl      - URL for the selector endpoint.
 * @param {string}   options.token            - Auth token.
 * @param {function} options.transform        - (rawItems: array) => array. Post-processes the
 *                                             raw data.items on every fetch (fresh + append).
 * @param {function} [options.onFreshResults] - Called with the transformed items after a
 *                                             successful non-append fetch. Lets the drawer reset
 *                                             drawer-specific state (e.g. activeIdx,
 *                                             expandedProducts) that this hook does not own.
 * @param {object}   [options.selectorContext={}] - Extra params spread into every fetch request.
 *                                             Stable via internal ref — changes do not re-trigger
 *                                             doFetch's useCallback.
 * @param {number}   [options.autoWaterfallMin=0]  - If > 0, after each non-append fetch the hook
 *                                             will keep fetching the next page while the
 *                                             transformed visible count < this value and hasMore is
 *                                             true. Pass 15 to mirror ProductSearchDrawer's
 *                                             original behavior.
 * @param {function} [options.onOpen]         - Called inside the open-reset effect so the caller
 *                                             can run extra logic (e.g. fetchAllImages, reset
 *                                             extra state) without a second useEffect on `open`.
 * @param {function} [options.onClose]        - Called when the user presses Escape. The hook
 *                                             manages the keydown listener internally when `open`
 *                                             is true.
 * @param {number}   [options.activeIdx=-1]   - Current keyboard-navigation index. The hook
 *                                             scrolls activeItemRef into view whenever it changes.
 *
 * Returns:
 *   { query, setQuery, results, setResults, loading, loadingMore, hasMore, totalCount,
 *     inputRef, listRef, activeItemRef, fetchTimer, abortRef, rawOffsetRef,
 *     doFetch, handleScroll }
 *
 * Side-effects managed here:
 *   - open-reset effect  (resets state + fires initial fetch when `open` flips true; calls onOpen)
 *   - cleanup effect     (clears timer + aborts in-flight request on unmount)
 *   - Escape-key effect  (gated on `open`; calls onClose)
 *   - scrollIntoView effect (gated on activeIdx >= 0; scrolls activeItemRef)
 */
export function useProductSelectorFetch({
  open,
  selectorUrl,
  token,
  transform,
  onFreshResults,
  selectorContext = {},
  autoWaterfallMin = 0,
  onOpen,
  onClose,
  activeIdx = -1,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const activeItemRef = useRef(null);
  const fetchTimer = useRef(null);
  const abortRef = useRef(null);
  const rawOffsetRef = useRef(0);

  // Keep stable refs to callbacks so doFetch's dep array stays stable even when
  // the caller passes inline arrow functions on every render.
  const onFreshResultsRef = useRef(onFreshResults);
  useEffect(() => { onFreshResultsRef.current = onFreshResults; }, [onFreshResults]);

  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // selectorContext is spread into fetch params. Use a ref so doFetch's dep array
  // stays stable when the caller updates the context object reference each render.
  const selectorContextRef = useRef(selectorContext);
  useEffect(() => { selectorContextRef.current = selectorContext; }, [selectorContext]);

  const doFetch = useCallback((q, offset = 0, append = false) => {
    if (!append) {
      clearTimeout(fetchTimer.current);
      if (abortRef.current) abortRef.current.abort();
      rawOffsetRef.current = 0;
    }
    if (!selectorUrl || !token) { setResults([]); setLoading(false); return; }
    if (append) setLoadingMore(true);
    else setLoading(true);

    const delay = q && !append ? 300 : 0;
    fetchTimer.current = setTimeout(() => {
      const controller = new AbortController();
      if (!append) abortRef.current = controller;
      const params = { ...selectorContextRef.current, limit: PAGE_SIZE, offset };
      if (q) params.q = q.trim();
      fetch(buildUrlWithParams(selectorUrl, params), {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const raw = data?.items || [];
          rawOffsetRef.current = offset + raw.length;
          let visible;
          if (append) {
            setResults(prev => {
              visible = transform([...prev, ...raw]);
              return visible;
            });
          } else {
            visible = transform(raw);
            setResults(visible);
            onFreshResultsRef.current?.(visible);
          }
          const stillHasMore = data?.hasMore ?? false;
          setHasMore(stillHasMore);
          setTotalCount(data?.totalCount ?? (visible?.length ?? 0));
          setLoading(false);
          setLoadingMore(false);
          // Auto-waterfall: keep fetching until we have enough visible results.
          if (!append && autoWaterfallMin > 0 && (visible?.length ?? 0) < autoWaterfallMin && stillHasMore) {
            doFetch(q, rawOffsetRef.current, true);
          }
        })
        .catch(err => {
          if (err.name !== 'AbortError') {
            if (!append) setResults([]);
            setLoading(false);
            setLoadingMore(false);
          }
        });
    }, delay);
  }, [selectorUrl, token, transform, autoWaterfallMin]);

  // Reset all transient state and fire the initial fetch when the drawer opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setLoading(false);
    setLoadingMore(false);
    setHasMore(false);
    setTotalCount(0);
    setTimeout(() => inputRef.current?.focus(), 50);
    doFetch('', 0);
    onOpenRef.current?.();
  }, [open, doFetch]);

  // Abort any in-flight request and clear the debounce timer on unmount.
  useEffect(() => () => {
    clearTimeout(fetchTimer.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // Escape-key handler — delegates to onClose so each drawer's onClose is called.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current?.(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Scroll the active item into view when keyboard navigation changes activeIdx.
  useEffect(() => {
    if (activeIdx >= 0 && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      doFetch(query, rawOffsetRef.current, true);
    }
  }, [loadingMore, hasMore, query, doFetch]);

  return {
    query, setQuery,
    results, setResults,
    loading, loadingMore, hasMore, totalCount,
    inputRef, listRef, activeItemRef,
    fetchTimer, abortRef, rawOffsetRef,
    doFetch, handleScroll,
  };
}
