import { useState, useEffect, useMemo, useRef } from 'react';
import { Check, ChevronRight, ChevronDown, Warehouse } from 'lucide-react';
import ProductDrawerShell from './ProductDrawerShell.jsx';
import { ProductAvatar, formatQty, resolveImageId } from './productSelectorDrawerShared.jsx';
import { nextActiveIndex, arrowStartIndexFor } from './selectorSelection.js';

/**
 * M_Product_Stock_V returns one "generic" row per product (locator=null, qty=0) plus one
 * row per product+locator. Drop null-locator rows for products that have concrete rows —
 * showing an empty placeholder next to real stock rows only adds noise.
 */
function filterProductStockRows(rows) {
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

const FETCH_CONFIG = { transform: filterProductStockRows };

const rowKey = (row) => `${row.id}::${row._aux?._LOC || ''}`;

const ROW_BASE_CLASSNAME =
  'w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors';

function getRowClassName(isSelected, isActive) {
  if (isSelected) return `${ROW_BASE_CLASSNAME} border-primary bg-primary/10 text-foreground`;
  if (isActive) return `${ROW_BASE_CLASSNAME} border-border bg-muted text-foreground`;
  return `${ROW_BASE_CLASSNAME} border-border bg-muted/40 hover:bg-muted text-foreground`;
}

/**
 * Stock variant: groups results by product, lets the user filter by warehouse, and expands each
 * product to show its per-locator stock rows (warehouse name only — every warehouse has exactly
 * one locator, so the locator code adds no information). Group headers now show the product image
 * (shared ProductAvatar). Keyboard navigation indexes the flat list of currently-expanded rows.
 * On selection it calls `onSelect(row)` with the raw selector row; the caller maps fields (e.g.
 * storageBin, warehouse) via the field's `onSelectMappings` in decisions.json.
 */
function useStockVariant(ctx) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [warehouseFilter, setWarehouseFilter] = useState(null);

  const {
    open, results, freshToken, activeIdx, setActiveIdx, activeItemRef,
    inputRef, select, imageMap, neoBaseUrl, token, value, committedItem, query,
  } = ctx;
  const autoExpandedRef = useRef(false);

  // Reset drawer-specific state when the drawer opens (the shell stays mounted).
  useEffect(() => {
    if (!open) return;
    setSelectedKey(null);
    setExpandedProducts(new Set());
    setWarehouseFilter(null);
    autoExpandedRef.current = false;
  }, [open]);

  // Collapse everything when a fresh (non-append) fetch replaces the results.
  useEffect(() => { setExpandedProducts(new Set()); }, [freshToken]);

  // ETP-5948 — open the committed product's group once per open, as soon as it is loaded, so its
  // location rows can be marked and centred. Declared AFTER the collapse above (same commit, and
  // a functional update) so a fresh page cannot collapse it again.
  useEffect(() => {
    if (!open || value == null || value === '' || autoExpandedRef.current) return;
    if (!results.some(r => String(r.id) === String(value))) return;
    autoExpandedRef.current = true;
    setExpandedProducts(prev => new Set(prev).add(value));
  }, [open, value, results]);

  // All groups from raw results.
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

  // Unique warehouse names derived from all results.
  const availableWarehouses = useMemo(() => {
    const seen = new Map();
    for (const row of results) {
      const name = row.warehouse;
      if (name && !seen.has(name)) seen.set(name, name);
    }
    return [...seen.keys()];
  }, [results]);

  // Groups after warehouse filter applied.
  const groups = useMemo(() => {
    if (!warehouseFilter) return allGroups;
    return allGroups
      .map(g => ({ ...g, locations: g.locations.filter(r => r.warehouse === warehouseFilter) }))
      .filter(g => g.locations.length > 0);
  }, [allGroups, warehouseFilter]);

  // Auto-expand all when a warehouse filter is active; keep current state otherwise.
  useEffect(() => {
    if (warehouseFilter) {
      setExpandedProducts(new Set(groups.map(g => g.productId)));
      setActiveIdx(-1);
    }
  }, [warehouseFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flat list of visible (expanded) location rows for keyboard navigation.
  const flatRows = useMemo(() =>
    groups
      .filter(g => expandedProducts.has(g.productId))
      .flatMap(g => g.locations),
    [groups, expandedProducts],
  );

  // ETP-5948 — the committed row: the location row the line was saved with (recognised by the
  // item rebuilt from the field's mappings, see committedItemFromRow), else the product's group.
  const committedKey = committedItem ? rowKey(committedItem) : null;
  const committedRow = committedKey ? flatRows.find(r => rowKey(r) === committedKey) : null;
  const hasCommittedRow = committedKey != null && results.some(r => rowKey(r) === committedKey);
  const committedGroupId = value != null && value !== '' && !hasCommittedRow ? String(value) : null;
  const committedGroupFirstIdx = committedGroupId
    ? flatRows.findIndex(r => String(r.id) === committedGroupId)
    : -1;
  // Centred row: the committed row, or the first row of the committed group. Arrows start ON the
  // committed row (next = the row after it), or just before the group's first row (next = it).
  const selectedIndex = committedRow ? flatRows.indexOf(committedRow) : committedGroupFirstIdx;
  const arrowStart = committedRow ? selectedIndex : Math.max(-1, committedGroupFirstIdx - 1);
  const optionId = (row) => `product-stock-opt-${rowKey(row)}`;

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
    select(row);
  };

  const onNavKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      inputRef.current?.focus();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIdx(prev => nextActiveIndex(prev, arrowStartIndexFor(query, arrowStart), delta, flatRows.length));
    } else if (e.key === 'Enter' && activeIdx >= 0 && flatRows[activeIdx]) {
      e.preventDefault();
      handleSelect(flatRows[activeIdx]);
    }
  };

  const toolbar = availableWarehouses.length > 0 ? (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto shrink-0">
      <Warehouse
        className="h-3.5 w-3.5 text-muted-foreground shrink-0"
        data-testid="Warehouse__pssd" />
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
  ) : null;

  const body = (
    <ul className="py-2" role="listbox">
      {groups.map((group, gi) => {
        const isExpanded = expandedProducts.has(group.productId);
        const headRow = group.locations[0];
        return (
          <li key={group.productId}>
            {gi > 0 && <div className="mx-4 my-1.5 border-t border-border" />}
            {/* Product header — clickable to expand/collapse */}
            <button
              type="button"
              onClick={() => toggleProduct(group.productId)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
            >
              <ProductAvatar
                name={group.name}
                id={group.productId}
                imageId={headRow ? resolveImageId(headRow, imageMap) : null}
                neoBaseUrl={neoBaseUrl}
                token={token}
                sizeClass="w-9 h-9"
                data-testid="Avatar__pssd" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{group.name}</p>
                {group.code && <p className="text-xs text-muted-foreground">{group.code}</p>}
              </div>
              <span
                className="text-xs text-muted-foreground shrink-0 mr-1"
                data-testid={`product-stock-group-${group.productId}`}
              >
                {group.locations.length} {group.locations.length === 1 ? 'location' : 'locations'}
              </span>
              {String(group.productId) === committedGroupId && (
                <Check className="h-4 w-4 text-primary shrink-0" data-testid="product-stock-group-check" />
              )}
              {isExpanded
                ? <ChevronDown
                className="h-4 w-4 text-muted-foreground shrink-0"
                data-testid="ChevronDown__pssd" />
                : <ChevronRight
                className="h-4 w-4 text-muted-foreground shrink-0"
                data-testid="ChevronRight__pssd" />
              }
            </button>
            {/* Location sub-rows — only rendered when expanded */}
            {isExpanded && (
              <div className="px-4 pb-2 flex flex-col gap-1">
                {group.locations.map((row) => {
                  const flatIdx = flatRows.indexOf(row);
                  const isActive = flatIdx === activeIdx;
                  // ETP-5948 (D1): check + aria-selected = the committed row; the click in flight
                  // keeps only its border and background.
                  const isCommitted = row === committedRow;
                  const isSelected = selectedKey === rowKey(row);
                  const warehouseName = row.warehouse || '—';
                  const qty = formatQty(row._aux?._QTY);

                  return (
                    <button
                      key={rowKey(row)}
                      ref={isActive ? activeItemRef : null}
                      type="button"
                      id={optionId(row)}
                      role="option"
                      aria-selected={isCommitted}
                      data-option-index={flatIdx}
                      {...(isActive ? { 'data-highlighted': 'true' } : {})}
                      data-testid={`product-stock-option-${row.id}`}
                      onClick={() => handleSelect(row)}
                      className={getRowClassName(isSelected, isActive)}
                    >
                      <span className="flex-1 text-sm truncate">{warehouseName}</span>
                      {qty != null && (
                        <span className="text-xs tabular-nums text-muted-foreground shrink-0">{qty} ud</span>
                      )}
                      {isCommitted
                        ? <Check className="h-3.5 w-3.5 text-primary shrink-0" data-testid="Check__pssd" />
                        : <ChevronRight
                        className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                        data-testid="ChevronRight__pssd" />
                      }
                    </button>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return {
    toolbar,
    body,
    footerCount: groups.length,
    hasResults: groups.length > 0,
    onNavKeyDown,
    selectedIndex,
    activeDescendant: activeIdx >= 0 && flatRows[activeIdx] ? optionId(flatRows[activeIdx]) : null,
  };
}

/**
 * Window-agnostic product + stock picker. A thin wrapper over ProductDrawerShell that supplies the
 * grouped stock rendering. Used by any window that needs a product-with-stock lookup
 * (goods-movements, internal-consumption, and future stock-aware windows) via the `product-stock`
 * key in lookupDrawers.js.
 */
export default function ProductStockSearchDrawer({
  open,
  onClose,
  onSelect,
  selectorUrl,
  token,
  title = null,
  selectorContext = {},
  value = null,
  valueLabel = '',
  committedItem = null,
}) {
  return (
    <ProductDrawerShell
      open={open}
      onClose={onClose}
      onSelect={onSelect}
      selectorUrl={selectorUrl}
      token={token}
      title={title}
      selectorContext={selectorContext}
      value={value}
      valueLabel={valueLabel}
      committedItem={committedItem}
      fetchConfig={FETCH_CONFIG}
      useVariant={useStockVariant}
      maxHeight="68vh"
      data-testid="ProductDrawerShell__f84dc8" />
  );
}
