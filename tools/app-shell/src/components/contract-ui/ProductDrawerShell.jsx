import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Search, X, Loader2, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { resolveLookupCreateTarget } from './lookupCreateTargets.js';
import RecordCreateModal from './RecordCreateModal.jsx';
import {
  useProductImages,
  useProductSelectorFetch,
} from './productSelectorDrawerShared.jsx';

// Stable no-op so swapping it in for `onClose` does not churn the hook's ref effect.
const NOOP = () => {};

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
 *
 * ── Inline record creation ──
 * With `createEnabled`, the shell also offers a "create product" row and hosts the creation
 * modal. This lives HERE rather than in the three trigger components (`DataTable.LookupField`,
 * `InlineLinesPanel.LookupTrigger`, `EntityForm.LookupFormField`) because the shell already has
 * everything the feature needs — `selectorUrl` (which encodes both the document's spec and the
 * NEO root), `token` and `selectorContext` — so none of them had to change. The created record
 * is funnelled back through the shell's own `select()`, so every trigger receives it through the
 * exact same `onSelect` path a hand-picked row takes.
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
  createEnabled = false,
}) {
  const ui = useUI();
  const [activeIdx, setActiveIdx] = useState(-1);
  const [freshToken, setFreshToken] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const resolvedTitle = title ?? ui('product');
  const apiFetch = useApiFetch();

  const createTarget = useMemo(
    () => resolveLookupCreateTarget({ selectorUrl, createEnabled }),
    [selectorUrl, createEnabled],
  );

  /**
   * True while the creation modal owns the Escape key — and for one macrotask AFTER it
   * closes.
   *
   * Reading `createOpen` directly is not enough, and the trailing tick is the whole point.
   * Both the dialog and the selector hook listen for Escape on the DOCUMENT, in the same
   * native dispatch. The dialog's listener runs first, React flushes `setCreateOpen(false)`
   * synchronously (keydown is a discrete event), and the hook's listener — still part of the
   * same keypress — then reads an already-false `createOpen` and tears down the drawer with
   * the user's search inside it. Measured exactly that way: `modal-onCancel` followed by a
   * live close. Clearing the flag from a `setTimeout` puts it after the dispatch, so one
   * Escape closes one layer.
   */
  const suppressCloseRef = useRef(false);
  useEffect(() => {
    if (createOpen) {
      suppressCloseRef.current = true;
      return undefined;
    }
    const timer = setTimeout(() => { suppressCloseRef.current = false; }, 0);
    return () => clearTimeout(timer);
  }, [createOpen]);

  const handleClose = useCallback(() => {
    if (suppressCloseRef.current) return;
    onClose();
  }, [onClose]);

  const fetchState = useProductSelectorFetch({
    open,
    selectorUrl,
    token,
    transform: fetchConfig.transform,
    autoWaterfallMin: fetchConfig.autoWaterfallMin ?? 0,
    selectorContext,
    onFreshResults: () => { setActiveIdx(-1); setFreshToken(t => t + 1); },
    onClose: handleClose,
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

  /**
   * A freshly POSTed record is a plain CRUD row: no `label`, no `standardPrice`, no `_aux`.
   * The line's pricing callout needs the SELECTOR shape (`_aux._PSTD/_PLIM/_UOM/_CURR`), so
   * re-query the very selector this drawer is already bound to and hand `select()` the real
   * row. That keeps `applyOnSelectMappings`, `mergeSelectorAuxFields` and the callout running
   * byte-for-byte as they do for a hand-picked product.
   *
   * The fallback matters: the selector is called with the document's `priceList`, and a product
   * that has no row in THAT tariff may not come back at all (products are seeded at 0 only on
   * the tenant's default sales and purchase tariffs). Synthesizing keeps the line usable.
   */
  const handleCreated = useCallback(async (created) => {
    setCreateOpen(false);
    let row = null;
    try {
      const params = { ...selectorContext, limit: 20, offset: 0 };
      if (created?.searchKey) params.q = String(created.searchKey);
      const res = await apiFetch(buildUrlWithParams(selectorUrl, params), { baseUrl: '' });
      const data = res.ok ? await res.json() : null;
      row = (data?.items || []).find(item => item.id === created.id) ?? null;
    } catch {
      row = null;
    }
    select(row ?? synthesizeCreatedItem(created));
  }, [apiFetch, selectorUrl, selectorContext, select]);

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
      {/*
        While the creation modal is open the drawer is hidden but stays MOUNTED, so `query`,
        `results` and the fetch state survive a cancel untouched — the user comes back to the
        search they had typed. Rendering the modal as a SIBLING (never a child of the dialog
        container below) is deliberate: React synthetic events bubble through the React tree,
        not the DOM, so a nested modal's Escape would reach `handleKeyDown` and close both.
      */}
      {!createOpen && (
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
                  // !bg-transparent (not the plain utility) is deliberate: this drawer renders
                  // inline, never through a portal, so it stays a DOM descendant of whatever
                  // window mounted it. A window that applies a blanket `[&_input]:bg-*` override
                  // to its own panel (e.g. Assets' AssetsDetailPanel.jsx, to keep its OWN
                  // in-panel inputs matching the panel's card background) has higher specificity
                  // than a plain `bg-transparent` utility on this input and silently wins,
                  // painting this floating modal's search box with the host panel's background
                  // instead of its own (ETP-5357). `!important` makes this input immune to any
                  // such ancestor override, for every window that mounts this shared drawer.
                  className="flex-1 !bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
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
                {/*
                  Pinned create row. Sits at the TOP of the list rather than in the footer
                  because the footer is gated on `hasResults` — i.e. hidden in exactly the
                  "nothing found, I need to create it" moment this affordance exists for.
                  Mirrors CreatableSearchSelect's own CreateAction, including the
                  onMouseDown/preventDefault so it fires before the input blurs.
                  Deliberately OUTSIDE the arrow-key ring: each variant's onNavKeyDown indexes
                  into `results` with its own arithmetic, and a virtual row would mean editing
                  every variant. Reachable by Tab and by pointer.
                */}
                {createTarget && (
                  <button
                    type="button"
                    data-testid="product-search-create"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCreateOpen(true)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-primary hover:bg-muted/50 border-b border-border text-left"
                  >
                    <Plus className="h-4 w-4 shrink-0" data-testid="Plus__pds" />
                    <span className="truncate">{ui(createTarget.ctaKey)}</span>
                  </button>
                )}

                {loading && results.length === 0 && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2
                      className="h-6 w-6 text-muted-foreground animate-spin"
                      data-testid="Loader2__pds" />
                  </div>
                )}

                {/*
                  Not gated on a non-empty query: an empty search that legitimately returns
                  nothing used to render a completely blank body, which reads as broken —
                  doubly so now that a create row sits above it.
                */}
                {!loading && results.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <p className="text-sm">
                      {query.trim() ? ui('productSearchNoResults', { query }) : ui('noProductsFound')}
                    </p>
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
      )}
      {createTarget && createOpen && (
        <RecordCreateModal
          open
          target={createTarget}
          initialQuery={query}
          token={token}
          onCancel={() => {
            setCreateOpen(false);
            // The drawer remounts on the next render, so the input is a fresh node —
            // put the caret back in it so a keyboard user resumes where they left off.
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          onCreated={handleCreated}
          data-testid="RecordCreateModal__365d4d" />
      )}
    </>
  );
}

/**
 * Minimal selector-shaped row for a record the selector did not return (typically because the
 * document's price list is not one of the tariffs a new product is seeded into). Prices are 0
 * and the UoM is carried in both shapes — `_aux._UOM` is an identifier in every fixture we have
 * (`'EA'`, `'kg'`), but the id is kept top-level so the callout resolves either way.
 */
export function synthesizeCreatedItem(created) {
  const name = created?.name || created?._identifier || created?.searchKey || '';
  return {
    id: created?.id,
    name,
    label: name,
    _identifier: name,
    searchKey: created?.searchKey ?? null,
    uOM: created?.uOM ?? null,
    standardPrice: 0,
    _aux: {
      _UOM: created?.['uOM$_identifier'] ?? created?.uOM ?? null,
      _PSTD: '0',
      _PLIM: '0',
    },
  };
}
