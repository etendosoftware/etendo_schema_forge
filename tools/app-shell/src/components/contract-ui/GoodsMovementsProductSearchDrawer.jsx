import { useState, useEffect, useMemo } from 'react';
import { Search, X, Loader2, Check, ChevronRight, MapPin } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  Avatar,
  formatQty,
  useProductSelectorFetch,
} from './productSelectorDrawerShared.jsx';

/**
 * M_Product_Stock_V (AD reference 800011, "Product Complete") returns one "generic" row per
 * product (locator=null, qty=0) plus one row per product+locator. We keep ALL of them — the
 * generic row mirrors Classic's unfiltered grid and lets the user pick a product that has no
 * stock anywhere (or pick it and set the source bin manually). The only thing removed is exact
 * duplicates (same product + locator) that pagination can surface twice.
 */
function filterStockRows(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = `${row.id}::${row._aux?._LOC || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

// Best-effort storage-bin label: the OBUISEL selector may expose the locator code directly
// (storageBin / storageBin$_identifier); otherwise fall back to the warehouse name.
function getBinLabel(row) {
  return row.storageBin
    ?? row['storageBin$_identifier']
    ?? row._aux?._LOC$_identifier
    ?? row.warehouse
    ?? null;
}

function rowStateClass(isSelected, isActive) {
  if (isSelected) return 'bg-primary/10 text-foreground';
  if (isActive) return 'bg-muted text-foreground';
  return 'hover:bg-muted/50 text-foreground';
}

/**
 * Flat product/stock picker for Goods Movements. Unlike the default ProductSearchDrawer
 * (one card per product) this lists one row per product + storage bin, so the user selects
 * the exact source bin. On selection the line's `storageBin` is auto-filled from `_aux._LOC`
 * via the field's `onSelectMappings`. Quantity on hand is shown for orientation only.
 */
export default function GoodsMovementsProductSearchDrawer({
  open,
  onClose,
  onSelect,
  selectorUrl,
  token,
  title = null,
}) {
  const ui = useUI();
  const resolvedTitle = title ?? ui('product');
  const [selectedKey, setSelectedKey] = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);

  const rowKey = (row) => `${row.id}::${row._aux?._LOC || ''}`;

  const {
    query, setQuery,
    results,
    loading, loadingMore,
    inputRef, listRef, activeItemRef,
    doFetch, handleScroll,
  } = useProductSelectorFetch({
    open,
    selectorUrl,
    token,
    transform: filterStockRows,
    onFreshResults: () => setActiveIdx(-1),
    onClose,
    activeIdx,
  });

  // Reset drawer-specific state when the drawer opens.
  useEffect(() => {
    if (!open) return;
    setSelectedKey(null);
    setActiveIdx(-1);
  }, [open]);

  // Sort alphabetically by product name (locale-aware); rows of the same product stay
  // adjacent (Array.sort is stable, so generic + per-locator order within a product is kept).
  const rows = useMemo(() => {
    const productName = (row) => row.label || row.name || row._identifier || row.id || '';
    return [...results].sort((a, b) =>
      productName(a).localeCompare(productName(b), undefined, { sensitivity: 'base' }));
  }, [results]);

  const handleSelect = (row) => {
    setSelectedKey(rowKey(row));
    setTimeout(() => { onSelect(row); onClose(); }, 120);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      inputRef.current?.focus();
      setActiveIdx(prev => Math.min(prev + 1, rows.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      inputRef.current?.focus();
      setActiveIdx(prev => Math.max(prev - 1, 0));
    }
    if (e.key === 'Enter' && activeIdx >= 0 && rows[activeIdx]) {
      e.preventDefault();
      handleSelect(rows[activeIdx]);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onClick={onClose}>
        <div
          className="w-full max-w-xl bg-background rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
          style={{ maxHeight: '68vh' }}
          role="dialog"
          aria-modal="true"
        >
          {/* Search bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" data-testid="Search__gm5pd" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); doFetch(e.target.value, 0); }}
              placeholder={`${ui('searchLabelPrefix')} ${resolvedTitle}...`}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {(loading || loadingMore) && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" data-testid="Loader2__gm5pd" />}
            <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" data-testid="X__gm5pd" />
            </button>
          </div>

          {/* Results — one row per product + storage bin */}
          <div className="flex-1 overflow-y-auto" ref={listRef} onScroll={handleScroll}>
            {loading && rows.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" data-testid="Loader2__gm5pd" />
              </div>
            )}

            {!loading && rows.length === 0 && query.trim() && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">{ui('productSearchNoResults', { query })}</p>
              </div>
            )}

            {rows.length > 0 && (
              <ul className="py-2">
                {rows.map((row, idx) => {
                  const isActive = idx === activeIdx;
                  const isSelected = selectedKey === rowKey(row);
                  const name = row.label || row.name || row._identifier || row.id;
                  const code = row.searchKey || row.code || row.value || null;
                  const binLabel = getBinLabel(row);
                  const warehouse = row.warehouse || null;
                  const qty = formatQty(row._aux?._QTY);

                  return (
                    <li key={rowKey(row)}>
                      {idx > 0 && <div className="mx-4 border-t border-border/60" />}
                      <button
                        ref={isActive ? activeItemRef : null}
                        type="button"
                        data-testid={`gm-product-option-${row.id}`}
                        onClick={() => handleSelect(row)}
                        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${rowStateClass(isSelected, isActive)}`}
                      >
                        <Avatar name={name} id={row.id} data-testid="Avatar__gm5pd" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{name}</p>
                          {code && <p className="text-xs text-muted-foreground">{code}</p>}
                        </div>
                        {binLabel && (
                          <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" data-testid="MapPin__gm5pd" />
                            <span className="truncate max-w-[10rem]">
                              {binLabel}{warehouse && warehouse !== binLabel ? ` · ${warehouse}` : ''}
                            </span>
                          </div>
                        )}
                        {qty != null && (
                          <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-16 text-right">{qty}</span>
                        )}
                        {isSelected
                          ? <Check className="h-4 w-4 text-primary shrink-0" data-testid="Check__gm5pd" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" data-testid="ChevronRight__gm5pd" />}
                      </button>
                    </li>
                  );
                })}
                {loadingMore && (
                  <li className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" data-testid="Loader2__gm5pd" />
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Footer */}
          {rows.length > 0 && (
            <div className="px-4 py-1.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{ui('productSearchCount', { count: rows.length })}</span>
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
