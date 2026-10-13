import { useCallback, useEffect, useRef, useState } from 'react';
import { useUI } from '@/i18n';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export const SEARCH_POPUP_PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * SearchPopup — the centered "pick one from a long list" modal: a title, a search box and a
 * scrollable, paginated list of `{ id, name }` options, each shown in full (long names wrap
 * instead of being cut off).
 *
 * It started as the report filters' `popup-single` selector ("Desde la cuenta" in the general
 * ledger, trial balance and journal entries reports). ETP-5681 lifted it here so the account
 * pickers (Esquema contable, chart of accounts, the G/L journal line Account column) open the
 * same popup instead of a dropdown.
 *
 * Data-source agnostic: the caller supplies `loadPage(query, offset, signal)`, which resolves to
 * `{ items: Array<{id, name}>, hasMore: boolean }` — a server selector, a report selector or a
 * filter over a static catalog. The popup only owns the debounce, pagination, keyboard
 * navigation and the loading / empty / error states. A failed page is shown as an error with a
 * retry, never as "no results".
 *
 * Built on the app's Radix Dialog so it also works when opened from inside another modal.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(item: {id: string, name: string}) => void} props.onSelect — the popup does not close
 *   itself on select; the caller decides (it usually closes it).
 * @param {(query: string, offset: number, signal: AbortSignal) =>
 *   Promise<{items: Array<{id: string, name: string}>, hasMore: boolean}>} props.loadPage
 * @param {string} [props.title]
 * @param {string} [props['data-testid']] — root test id; options are `<testid>-option-<id>`.
 */
export function SearchPopup({ open, onClose, onSelect, loadPage, title = '', 'data-testid': dataTestId = 'search-popup' }) {
  const ui = useUI();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  const offsetRef = useRef(0);
  const abortRef = useRef(null);
  const sentinelRef = useRef(null);
  const activeRef = useRef(null);
  // The caller usually passes an inline loadPage; keep the latest in a ref so a re-render does
  // not refetch the first page.
  const loadPageRef = useRef(loadPage);
  useEffect(() => { loadPageRef.current = loadPage; }, [loadPage]);

  useEffect(() => {
    if (open) { setQuery(''); setFocusIdx(-1); }
  }, [open]);

  // First page: on open, on every (debounced) query change and on retry.
  useEffect(() => {
    if (!open) return undefined;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setOptions([]);
    setHasMore(false);
    offsetRef.current = 0;
    const timer = setTimeout(() => {
      Promise.resolve(loadPageRef.current(query.trim(), 0, controller.signal))
        .then(({ items = [], hasMore: more = false } = {}) => {
          if (controller.signal.aborted) return;
          setOptions(items);
          setHasMore(more);
          offsetRef.current = items.length;
          setFocusIdx(-1);
        })
        .catch((err) => {
          if (controller.signal.aborted || err?.name === 'AbortError') return;
          setError(err ?? new Error('load failed'));
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query ? SEARCH_DEBOUNCE_MS : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, reloadKey]);

  const loadMore = useCallback(() => {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) return;
    setLoadingMore(true);
    setError(null);
    Promise.resolve(loadPageRef.current(query.trim(), offsetRef.current, controller.signal))
      .then(({ items = [], hasMore: more = false } = {}) => {
        if (controller.signal.aborted) return;
        setOptions((prev) => [...prev, ...items]);
        setHasMore(more);
        offsetRef.current += items.length;
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        setError(err ?? new Error('load failed'));
        setHasMore(false);
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingMore(false); });
  }, [query]);

  // Infinite scroll: fetch the next page when the sentinel below the list becomes visible.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!open || !sentinel || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loading && !loadingMore) loadMore();
    }, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasMore, loading, loadingMore, loadMore]);

  useEffect(() => {
    if (focusIdx >= 0) activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusIdx]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && focusIdx >= 0 && options[focusIdx]) { e.preventDefault(); onSelect(options[focusIdx]); }
  };

  const errorMessage = error && (isNetworkError(error) ? error.message : ui('searchPopupError'));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      data-testid="Dialog__cfed54">
      <DialogContent
        aria-describedby={undefined}
        className="w-[42rem] max-w-[90vw] max-h-[480px] p-0 gap-0 flex flex-col overflow-hidden bg-card"
        data-testid={dataTestId}
      >
        <div className="px-4 py-3 pr-12 border-b border-border/30">
          <DialogTitle className="text-sm font-semibold" data-testid="DialogTitle__cfed54">{title}</DialogTitle>
        </div>
        <div className="px-4 py-2 border-b border-border/20">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`${ui('Search')}...`}
            data-testid={`${dataTestId}-input`}
            className="w-full h-8 px-2 text-sm border border-border rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="flex-1 overflow-auto py-1" role="listbox" aria-label={title}>
          {loading && <div className="flex justify-center py-6 text-muted-foreground text-xs">{ui('loading')}</div>}
          {!loading && error && options.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-xs" data-testid={`${dataTestId}-error`}>
              <span className="text-foreground">{errorMessage}</span>
              <button type="button" className="text-primary hover:underline" onClick={() => setReloadKey((k) => k + 1)}>
                {ui('retry')}
              </button>
            </div>
          )}
          {!loading && !error && options.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-xs" data-testid={`${dataTestId}-empty`}>{ui('noResults')}</div>
          )}
          {!loading && options.map((o, idx) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={idx === focusIdx}
              ref={idx === focusIdx ? activeRef : undefined}
              onClick={() => onSelect(o)}
              data-testid={`${dataTestId}-option-${o.id}`}
              className={['w-full text-left px-4 py-2 text-sm break-words', idx === focusIdx ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'].join(' ')}
            >
              {o.name}
            </button>
          ))}
          {!loading && error && options.length > 0 && (
            <div className="flex justify-center gap-2 py-2 text-xs" data-testid={`${dataTestId}-load-more-error`}>
              <span>{errorMessage}</span>
              <button type="button" className="text-primary hover:underline" onClick={() => { setError(null); setHasMore(true); }}>
                {ui('retry')}
              </button>
            </div>
          )}
          <div ref={sentinelRef} className="py-1 flex justify-center">
            {loadingMore && <span className="text-xs text-muted-foreground">{ui('loadingMore')}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A `SearchPopup` page loader over an in-memory `{ id, name }` list: case-insensitive match on
 * the label, paged like a server selector.
 *
 * @param {Array<{id: string, name: string}>} items
 */
export function staticPageLoader(items) {
  return (query, offset) => {
    const q = query.toLowerCase();
    const matches = q ? items.filter((o) => o.name.toLowerCase().includes(q)) : items;
    return Promise.resolve({
      items: matches.slice(offset, offset + SEARCH_POPUP_PAGE_SIZE),
      hasMore: offset + SEARCH_POPUP_PAGE_SIZE < matches.length,
    });
  };
}

export default SearchPopup;
