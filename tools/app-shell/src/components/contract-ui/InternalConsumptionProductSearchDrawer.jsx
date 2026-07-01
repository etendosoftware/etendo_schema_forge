import { useState, useEffect, useMemo } from 'react';
import { Search, X, Loader2, Check, ChevronRight, ChevronDown, Warehouse } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  Avatar,
  formatQty,
  useProductSelectorFetch,
} from './productSelectorDrawerShared.jsx';

/**
 * M_Product_Stock_V returns one "generic" row per product (locator=null, qty=0) plus one
 * row per product+locator. Drop null-locator rows for products that have concrete rows.
 */
function filterICProductRows(rows) {
  const productsWithLocator = new Set();
  for (const row of rows) {
    if (row._aux?._LOC) productsWithLocator.add(row.id);
  }
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const locatorId = row._aux?._LOC || '';
    if (!locatorId && productsWithLocator.has(row.id)) continue;
    const key = `${row.id}::${locatorId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

export default function InternalConsumptionProductSearchDrawer({
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
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [warehouseFilter, setWarehouseFilter] = useState(null);

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
    transform: filterICProductRows,
    onFreshResults: () => {
      setActiveIdx(-1);
      setExpandedProducts(new Set());
    },
    onClose,
    activeIdx,
  });

  // Reset drawer-specific state when the drawer opens.
  useEffect(() => {
    if (!open) return;
    setSelectedKey(null);
    setActiveIdx(-1);
    setExpandedProducts(new Set());
    setWarehouseFilter(null);
  }, [open]);

  // All groups from raw results
  const allGroups = useMemo(() => {
    const map = new Map();
    const order = [];
    for (const row of results) {
      if (!map.has(row.id)) {
        map.set(row.id, {
          productId: row.id,
          name: row.label || row.name || row._identifier || row.id,
          code: row.searchKey || row.code || row.value || null,
          locations: [],
        });
        order.push(map.get(row.id));
      }
      map.get(row.id).locations.push(row);
    }
    return order;
  }, [results]);

  // Unique warehouse names derived from all results
  const availableWarehouses = useMemo(() => {
    const seen = new Map();
    for (const row of results) {
      const name = row.warehouse;
      if (name && !seen.has(name)) seen.set(name, name);
    }
    return [...seen.keys()];
  }, [results]);

  // Groups after warehouse filter applied
  const groups = useMemo(() => {
    if (!warehouseFilter) return allGroups;
    return allGroups
      .map(g => ({ ...g, locations: g.locations.filter(r => r.warehouse === warehouseFilter) }))
      .filter(g => g.locations.length > 0);
  }, [allGroups, warehouseFilter]);

  // Auto-expand all when a warehouse filter is active; keep current state otherwise
  useEffect(() => {
    if (warehouseFilter) {
      setExpandedProducts(new Set(groups.map(g => g.productId)));
      setActiveIdx(-1);
    }
  }, [warehouseFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flat list of visible (expanded) location rows for keyboard navigation
  const flatRows = useMemo(() =>
    groups
      .filter(g => expandedProducts.has(g.productId))
      .flatMap(g => g.locations),
    [groups, expandedProducts],
  );

  const toggleProduct = (productId) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        setActiveIdx(-1);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleSelect = (row) => {
    setSelectedKey(rowKey(row));
    setTimeout(() => { onSelect(row); onClose(); }, 120);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      inputRef.current?.focus();
      setActiveIdx(prev => Math.min(prev + 1, flatRows.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      inputRef.current?.focus();
      setActiveIdx(prev => Math.max(prev - 1, 0));
    }
    if (e.key === 'Enter' && activeIdx >= 0 && flatRows[activeIdx]) {
      e.preventDefault();
      handleSelect(flatRows[activeIdx]);
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
            <Search
              className="h-4 w-4 text-muted-foreground shrink-0"
              data-testid="Search__cd0fc5" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); doFetch(e.target.value, 0); }}
              placeholder={`${ui('searchLabelPrefix')} ${resolvedTitle}...`}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {(loading || loadingMore) && <Loader2
              className="h-4 w-4 text-muted-foreground animate-spin shrink-0"
              data-testid="Loader2__cd0fc5" />}
            <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" data-testid="X__cd0fc5" />
            </button>
          </div>

          {/* Warehouse filter pills */}
          {availableWarehouses.length > 0 && (
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto shrink-0">
              <Warehouse
                className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                data-testid="Warehouse__cd0fc5" />
              <button
                type="button"
                onClick={() => { setWarehouseFilter(null); setActiveIdx(-1); }}
                className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  warehouseFilter === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                All
              </button>
              {availableWarehouses.map(wh => (
                <button
                  key={wh}
                  type="button"
                  onClick={() => { setWarehouseFilter(wh === warehouseFilter ? null : wh); setActiveIdx(-1); }}
                  className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    warehouseFilter === wh
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {wh}
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-y-auto" ref={listRef} onScroll={handleScroll}>
            {loading && results.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <Loader2
                  className="h-6 w-6 text-muted-foreground animate-spin"
                  data-testid="Loader2__cd0fc5" />
              </div>
            )}

            {!loading && results.length === 0 && query.trim() && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">{ui('productSearchNoResults', { query })}</p>
              </div>
            )}

            {groups.length > 0 && (
              <ul className="py-2">
                {groups.map((group, gi) => {
                  const isExpanded = expandedProducts.has(group.productId);
                  return (
                    <li key={group.productId}>
                      {gi > 0 && <div className="mx-4 my-1.5 border-t border-border" />}
                      {/* Product header — clickable to expand/collapse */}
                      <button
                        type="button"
                        onClick={() => toggleProduct(group.productId)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                      >
                        <Avatar name={group.name} id={group.productId} data-testid="Avatar__cd0fc5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{group.name}</p>
                          {group.code && <p className="text-xs text-muted-foreground">{group.code}</p>}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 mr-1">
                          {group.locations.length} {group.locations.length === 1 ? 'location' : 'locations'}
                        </span>
                        {isExpanded
                          ? <ChevronDown
                          className="h-4 w-4 text-muted-foreground shrink-0"
                          data-testid="ChevronDown__cd0fc5" />
                          : <ChevronRight
                          className="h-4 w-4 text-muted-foreground shrink-0"
                          data-testid="ChevronRight__cd0fc5" />
                        }
                      </button>
                      {/* Location sub-rows — only rendered when expanded */}
                      {isExpanded && (
                        <div className="px-4 pb-2 flex flex-col gap-1">
                          {group.locations.map((row) => {
                            const flatIdx = flatRows.indexOf(row);
                            const isActive = flatIdx === activeIdx;
                            const isSelected = selectedKey === rowKey(row);
                            const warehouseName = row.warehouse || '—';
                            const qty = formatQty(row._aux?._QTY);

                            return (
                              <button
                                key={rowKey(row)}
                                ref={isActive ? activeItemRef : null}
                                type="button"
                                onClick={() => handleSelect(row)}
                                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                                  isSelected
                                    ? 'border-primary bg-primary/10 text-foreground'
                                    : isActive
                                    ? 'border-border bg-muted text-foreground'
                                    : 'border-border bg-muted/40 hover:bg-muted text-foreground'
                                }`}
                              >
                                <span className="flex-1 text-sm truncate">{warehouseName}</span>
                                {qty != null && (
                                  <span className="text-xs tabular-nums text-muted-foreground shrink-0">{qty} ud</span>
                                )}
                                {isSelected
                                  ? <Check className="h-3.5 w-3.5 text-primary shrink-0" data-testid="Check__cd0fc5" />
                                  : <ChevronRight
                                  className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                                  data-testid="ChevronRight__cd0fc5" />
                                }
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
                {loadingMore && (
                  <li className="flex items-center justify-center py-3">
                    <Loader2
                      className="h-4 w-4 text-muted-foreground animate-spin"
                      data-testid="Loader2__cd0fc5" />
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Footer */}
          {groups.length > 0 && (
            <div className="px-4 py-1.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{ui('productSearchCount', { count: groups.length })}</span>
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
