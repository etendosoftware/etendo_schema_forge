import { useCallback, useEffect, useRef, useState } from 'react';
import { useUI } from '@/i18n';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  resolveSelectedIndex, prependCurrentSelection, nextActiveIndex, arrowStartIndexFor, hasCommittedValue, pinSearchTerms,
} from './selectorSelection.js';
import { useLocateCommittedValue } from './useLocateCommittedValue.js';

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
 * @param {string} [props.value] — ETP-5948: the committed id. On open it is marked (check +
 *   `aria-selected`), located in place by walking up to LOCATE_SELECTION_MAX_PAGES pages, and
 *   centred; not found, it is pinned on top. Without it the popup behaves as before.
 * @param {string} [props.valueLabel] — the committed value's label: the search that pins it.
 * @param {string} [props['data-testid']] — root test id; options are `<testid>-option-<id>`.
 */
export function SearchPopup({
  open, onClose, onSelect, loadPage, title = '', value = null, valueLabel = '',
  'data-testid': dataTestId = 'search-popup',
}) {
  const ui = useUI();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  // ETP-5948 — the query whose first page is on screen (null while none is). `options` and
  // `hasMore` outlive a close or a new search for one render, so the walk only trusts them when
  // they belong to the current query; reset on close so a reopen never decides on the last
  // open's rows.
  const [pageQuery, setPageQuery] = useState(null);
  const [settledFetches, setSettledFetches] = useState(0);
  const [locateDone, setLocateDone] = useState(false);
  const [pinned, setPinned] = useState([]);
  const offsetRef = useRef(0);
  const abortRef = useRef(null);
  const sentinelRef = useRef(null);
  const activeRef = useRef(null);
  const listRef = useRef(null);
  const interactedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const pinAttemptedRef = useRef(false);
  // The caller usually passes an inline loadPage; keep the latest in a ref so a re-render does
  // not refetch the first page.
  const loadPageRef = useRef(loadPage);
  useEffect(() => { loadPageRef.current = loadPage; }, [loadPage]);

  useEffect(() => {
    if (open) { setQuery(''); setFocusIdx(-1); }
    else setPageQuery(null);
  }, [open]);

  // A pinned row belongs to one value, one search and one open.
  useEffect(() => {
    setPinned([]);
    setLocateDone(false);
    pinAttemptedRef.current = false;
  }, [value, query, open]);

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
    setPageQuery(null);
    offsetRef.current = 0;
    const trimmed = query.trim();
    const timer = setTimeout(() => {
      Promise.resolve(loadPageRef.current(trimmed, 0, controller.signal))
        .then(({ items = [], hasMore: more = false } = {}) => {
          if (controller.signal.aborted) return;
          setOptions(items);
          setHasMore(more);
          setPageQuery(trimmed);
          offsetRef.current = items.length;
          setFocusIdx(-1);
        })
        .catch((err) => {
          if (controller.signal.aborted || err?.name === 'AbortError') return;
          setError(err ?? new Error('load failed'));
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          setLoading(false);
          setSettledFetches((n) => n + 1);
        });
    }, query ? SEARCH_DEBOUNCE_MS : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, reloadKey]);

  const loadMore = useCallback(() => {
    const controller = abortRef.current;
    // The sentinel and the ETP-5948 walk both page: one request at a time.
    if (!controller || controller.signal.aborted || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
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
      .finally(() => {
        loadingMoreRef.current = false;
        if (controller.signal.aborted) return;
        setLoadingMore(false);
        setSettledFetches((n) => n + 1);
      });
  }, [query]);

  // ETP-5948 — the ETP-5903 reopen behaviour: walk to the committed value, centre it, then pin it.
  const rows = pageQuery !== null && pageQuery === query.trim() ? options : null;
  const searching = query.trim() !== '';
  const rendered = searching ? options : prependCurrentSelection(options, pinned, value);
  const selectedIndex = resolveSelectedIndex(rendered, value);
  const optionId = (o) => `${dataTestId}-option-${o.id}`;

  useLocateCommittedValue({
    open, query, value, dropdownRef: listRef, interactedRef, canFetch: true,
    rows, loading: loading || loadingMore, panelLoading: loading,
    hasMore, pageSize: SEARCH_POPUP_PAGE_SIZE, settledFetches, locateDone, setLocateDone,
    fetchPage: loadMore, offsetRef, selectedIndex, renderedCount: rendered.length, layoutKey: open,
  });

  // Not found in place: ask the same loader for the label and keep ONLY the id-equal row, so an
  // id the loader would not offer is never pinned. Once per value, search and open.
  useEffect(() => {
    if (!open || !locateDone || searching || !hasCommittedValue(value) || !valueLabel) return undefined;
    if (pinAttemptedRef.current || resolveSelectedIndex(options, value) !== -1) return undefined;
    // A token, not `true`: the reset effect clears it, so a late answer for an old value, search
    // or open is dropped.
    const attempt = {};
    pinAttemptedRef.current = attempt;
    const lookup = async () => {
      for (const term of pinSearchTerms(valueLabel)) {
        const { items = [] } = (await loadPageRef.current(term, 0, new AbortController().signal)) ?? {};
        const match = items.filter((o) => String(o.id) === String(value));
        if (match.length || pinAttemptedRef.current !== attempt) return match;
      }
      return [];
    };
    lookup()
      .then((match) => { if (pinAttemptedRef.current === attempt) setPinned(match); })
      .catch(() => {});
    return undefined;
  }, [open, locateDone, searching, value, valueLabel, options]);

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
    interactedRef.current = true;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setFocusIdx((i) => nextActiveIndex(i, arrowStartIndexFor(query, selectedIndex), delta, rendered.length));
    } else if (e.key === 'Enter' && focusIdx >= 0 && rendered[focusIdx]) {
      e.preventDefault();
      onSelect(rendered[focusIdx]);
    }
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
            onChange={(e) => { interactedRef.current = true; setQuery(e.target.value); }}
            onKeyDown={handleKeyDown}
            aria-activedescendant={focusIdx >= 0 && rendered[focusIdx] ? optionId(rendered[focusIdx]) : undefined}
            placeholder={`${ui('Search')}...`}
            data-testid={`${dataTestId}-input`}
            className="w-full h-8 px-2 text-sm border border-border rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="flex-1 overflow-auto py-1" role="listbox" aria-label={title} ref={listRef}>
          {loading && <div className="flex justify-center py-6 text-muted-foreground text-xs">{ui('loading')}</div>}
          {!loading && error && options.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-xs" data-testid={`${dataTestId}-error`}>
              <span className="text-foreground">{errorMessage}</span>
              <button type="button" className="text-primary hover:underline" onClick={() => setReloadKey((k) => k + 1)}>
                {ui('retry')}
              </button>
            </div>
          )}
          {!loading && !error && rendered.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-xs" data-testid={`${dataTestId}-empty`}>{ui('noResults')}</div>
          )}
          {/* ETP-5948 — the ETP-5903 contract: check + aria-selected mark the COMMITTED value
              (never the keyboard focus, the ETP-5846 bug); the highlight is data-highlighted,
              exposed through aria-activedescendant on the search box. */}
          {!loading && rendered.map((o, idx) => {
            const isSelected = idx === selectedIndex;
            const isHighlighted = idx === focusIdx;
            return (
              <button
                key={o.id}
                id={optionId(o)}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-option-index={idx}
                {...(isHighlighted ? { 'data-highlighted': 'true' } : {})}
                ref={isHighlighted ? activeRef : undefined}
                onClick={() => onSelect(o)}
                data-testid={optionId(o)}
                className={['w-full flex items-start gap-2 text-left px-4 py-2 text-sm break-words', isHighlighted ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50', isSelected ? 'font-medium' : ''].join(' ')}
              >
                {isSelected
                  ? <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" aria-hidden="true" data-testid={`${dataTestId}-check`} />
                  : <span className="w-4 shrink-0" />}
                <span className="min-w-0">{o.name}</span>
              </button>
            );
          })}
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
