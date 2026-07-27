import { useState, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  useProductImages,
  useProductSelectorFetch,
} from './productSelectorDrawerShared.jsx';

/**
 * Shared shell for every Product selector modal.
 *
 * It is the SINGLE place that owns all visual chrome (overlay, dialog container, search bar,
 * loading / no-results states, footer, keyboard shortcuts hint) plus the fetch/keyboard/close
 * plumbing (useProductSelectorFetch wiring, bulk image loading, Escape / overlay / X close, and
 * the 120 ms selection delay). Change the overlay or container styling HERE — e.g. a red
 * background — and it applies to every variant automatically.
 *
 * Variants stay thin: they supply only their divergent parts through the `useVariant` hook,
 * which receives the shared context (fetch state + helpers) and returns
 * `{ toolbar?, body, footerCount, hasResults, onNavKeyDown }`. Keeping the hook in the shell
 * lets each variant own its own state (grouping, expand/collapse, warehouse filter, per-row
 * selection, keyboard navigation over its own list) while the shell renders the chrome.
 *
 * The `onSelect(item)` contract is identical across variants: the raw selector row is forwarded
 * untouched.
 */
export default function ProductDrawerShell({
  open,
  onClose,
  onSelect,
  selectorUrl,
  token,
  title = null,
  selectorContext = {},
  keepOpenOnSelect = false,
  selectedIds = [],
  fetchConfig,
  useVariant,
  maxHeight = '65vh',
}) {
  const ui = useUI();
  const [activeIdx, setActiveIdx] = useState(-1);
  const [freshToken, setFreshToken] = useState(0);
  const resolvedTitle = title ?? ui('product');

  const fetchState = useProductSelectorFetch({
    open,
    selectorUrl,
    token,
    transform: fetchConfig.transform,
    autoWaterfallMin: fetchConfig.autoWaterfallMin ?? 0,
    selectorContext,
    onFreshResults: () => { setActiveIdx(-1); setFreshToken(t => t + 1); },
    onClose,
    activeIdx,
  });

  const { imageMap, neoBaseUrl } = useProductImages({ open, selectorUrl, token });

  // Canonical selection: brief highlight delay, then forward the raw row and (unless the caller
  // keeps the modal open for multi-select) close.
  const select = useCallback((item) => {
    setTimeout(() => {
      onSelect(item);
      if (!keepOpenOnSelect) onClose();
    }, 120);
  }, [onSelect, onClose, keepOpenOnSelect]);

  const variant = useVariant({
    ...fetchState,
    open,
    activeIdx,
    setActiveIdx,
    freshToken,
    select,
    onSelect,
    onClose,
    keepOpenOnSelect,
    selectedIds,
    selectorContext,
    imageMap,
    neoBaseUrl,
    token,
  });

  if (!open) return null;

  const {
    query, setQuery, results, loading, loadingMore,
    inputRef, listRef, doFetch, handleScroll,
  } = fetchState;
  const { toolbar, body, footerCount, hasResults, onNavKeyDown } = variant;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    onNavKeyDown?.(e);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onClick={onClose}>
        <div
          data-testid="product-search-drawer"
          className="w-full max-w-xl bg-background rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
          style={{ maxHeight }}
          role="dialog"
          aria-modal="true"
        >
          {/* Search bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search
              className="h-4 w-4 text-muted-foreground shrink-0"
              data-testid="Search__pds" />
            <input
              ref={inputRef}
              data-testid="product-search-input"
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); doFetch(e.target.value, 0); }}
              placeholder={`${ui('searchLabelPrefix')} ${resolvedTitle}...`}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {(loading || loadingMore) && <Loader2
              className="h-4 w-4 text-muted-foreground animate-spin shrink-0"
              data-testid="Loader2__pds" />}
            <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" data-testid="X__pds" />
            </button>
          </div>

          {/* Variant toolbar slot (e.g. warehouse-filter pills) */}
          {toolbar}

          {/* Results */}
          <div className="flex-1 overflow-y-auto" ref={listRef} onScroll={handleScroll}>
            {loading && results.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <Loader2
                  className="h-6 w-6 text-muted-foreground animate-spin"
                  data-testid="Loader2__pds" />
              </div>
            )}

            {!loading && results.length === 0 && query.trim() && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">{ui('productSearchNoResults', { query })}</p>
              </div>
            )}

            {hasResults && body}

            {loadingMore && (
              <div className="flex items-center justify-center py-3">
                <Loader2
                  className="h-4 w-4 text-muted-foreground animate-spin"
                  data-testid="Loader2__pds" />
              </div>
            )}
          </div>

          {/* Footer */}
          {hasResults && (
            <div className="px-4 py-1.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{ui('productSearchCount', { count: footerCount })}</span>
              <span className="flex items-center gap-2">
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">↑↓</kbd> {ui('productSearchNavigate')}
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">↵</kbd> {ui('productSearchSelect')}
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">esc</kbd> {ui('productSearchClose')}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
