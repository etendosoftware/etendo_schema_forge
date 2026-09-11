import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useCurrency } from '@/hooks/useCurrency.jsx';
import ProductDrawerShell from './ProductDrawerShell.jsx';
import { ProductAvatar, resolveImageId } from './productSelectorDrawerShared.jsx';

/**
 * Deduplicates selector results by searchKey — prefer warehouse-specific rows (with
 * actual stock data) over generic rows (warehouse: null, _QTY: "0").
 * Defined at module level so the reference is stable and does not invalidate doFetch's
 * useCallback deps on every render.
 */
function deduplicateBySearchKey(items) {
  const seenKeys = new Map(); // key → index in result array
  const result = [];
  for (const item of items) {
    const key = item.searchKey || item.id;
    if (seenKeys.has(key)) {
      const idx = seenKeys.get(key);
      if (!result[idx].warehouse && item.warehouse) {
        result[idx] = item; // Replace generic row with warehouse-specific row
      }
    } else {
      seenKeys.set(key, result.length);
      result.push(item);
    }
  }
  return result;
}

const FETCH_CONFIG = { transform: deduplicateBySearchKey, autoWaterfallMin: 15 };

const getName = (item) => item.label || item.name || item._identifier || item.id;
const getCode = (item) => item.searchKey || item.code || item.value || null;
const getImage = (item) => item.imageUrl || item.imageurl || null;

/**
 * Default / price variant: a flat, deduplicated product list showing the product image, name,
 * code and price. Supports optional multi-select (keepOpenOnSelect + selectedIds toggle) for the
 * report-viewer picker; single-select for form fields. Keyboard navigation indexes the flat
 * results list.
 */
function useDefaultVariant(ctx) {
  const sessionCurrency = useCurrency();
  const [selectedId, setSelectedId] = useState(null);

  const {
    open, results, activeIdx, setActiveIdx, activeItemRef, inputRef,
    select, onSelect, selectedIds, selectorContext, imageMap, neoBaseUrl, token,
  } = ctx;

  const currency = selectorContext?.priceCurrency ?? selectorContext?.currency ?? sessionCurrency ?? 'USD';

  // ETP-5148 — secondary converted price (e.g. catalog price in org currency EUR shown
  // alongside its equivalent in the document currency USD). Only meaningful when the
  // window opted into `priceCurrency` (window.selectorPriceCurrency: "org") AND the
  // document currency actually differs from it AND a usable rate was resolved — see
  // selectorContext.js's buildLineSelectorContext for the rate's sentinel rules.
  const documentCurrency = selectorContext?.currency ?? null;
  const conversionRate = (selectorContext?.priceCurrency && documentCurrency && documentCurrency !== selectorContext.priceCurrency)
    ? selectorContext?.priceCurrencyRate
    : null;

  // Reset the transient highlight when the drawer opens (the shell stays mounted).
  useEffect(() => { if (open) setSelectedId(null); }, [open]);

  // Raw numeric price, or null when missing/non-numeric — shared by the main
  // (string-or-number-tolerant) formatter below and the conversion helper, which
  // needs a real number to multiply by the rate (case: non-numeric price → no
  // secondary line, same as the main price falling back to the raw string).
  const getRawPrice = (item) => {
    const p = item.standardPrice || item.listPrice || item.price;
    if (p == null) return null;
    const num = typeof p === 'number' ? p : parseFloat(p);
    return isNaN(num) ? null : num;
  };

  const getPrice = (item) => {
    const p = item.standardPrice || item.listPrice || item.price;
    if (p == null) return null;
    const num = getRawPrice(item);
    if (num == null) return String(p);
    return formatCurrency(currency, num);
  };

  const getConvertedPrice = (item) => {
    if (!conversionRate) return null;
    const num = getRawPrice(item);
    if (num == null) return null;
    return formatCurrency(documentCurrency, num * conversionRate);
  };

  const handleSelect = (item) => {
    if (selectedIds.includes(item.id)) {
      setSelectedId(null);
      onSelect(item);
      return;
    }
    setSelectedId(item.id);
    select(item);
  };

  const onNavKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); inputRef.current?.focus(); setActiveIdx(prev => Math.min(prev + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); inputRef.current?.focus(); setActiveIdx(prev => Math.max(prev - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) { e.preventDefault(); handleSelect(results[activeIdx]); }
  };

  const body = (
    <ul className="py-1">
      {results.map((item, i) => {
        const name = getName(item);
        const code = getCode(item);
        const price = getPrice(item);
        const convertedPrice = getConvertedPrice(item);
        const isActive = i === activeIdx;
        const isSelected = selectedId === item.id || selectedIds.includes(item.id);

        return (
          <li key={item.id} ref={isActive ? activeItemRef : null}>
            <button
              type="button"
              data-testid={`product-search-option-${item.id}`}
              onClick={() => handleSelect(item)}
              className={`w-full text-left px-4 py-2 transition-colors cursor-pointer flex items-center gap-3 border-l-2 ${
                isActive
                  ? `border-primary ${isSelected ? 'bg-primary/20' : 'bg-primary/10'}`
                  : `border-transparent ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`
              }`}
            >
              <ProductAvatar
                name={name}
                id={item.id}
                imageUrl={getImage(item)}
                imageId={resolveImageId(item, imageMap)}
                neoBaseUrl={neoBaseUrl}
                token={token}
                data-testid="Avatar__pds" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{name}</p>
                {code && <p className="text-xs text-muted-foreground">{code}</p>}
              </div>
              {price && (
                <span className="flex flex-col items-end shrink-0">
                  <span className="text-sm tabular-nums text-muted-foreground">{price}</span>
                  {convertedPrice && (
                    <span className="text-xs tabular-nums text-muted-foreground/70">{convertedPrice}</span>
                  )}
                </span>
              )}
              {isSelected && (
                <Check className="h-4 w-4 text-primary shrink-0" data-testid="Check__pds" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return {
    body,
    // Always reflect the deduplicated list the user sees, not the backend's
    // raw row count (which can exceed the visible count for selectors that
    // return multiple rows per product, e.g. one per price-list version).
    footerCount: results.length,
    hasResults: results.length > 0,
    onNavKeyDown,
  };
}

export default function ProductSearchDrawer({
  open,
  onClose,
  onSelect,
  selectorUrl,
  token,
  title = null,
  keepOpenOnSelect = false,
  selectedIds = [],
  selectorContext = {},
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
      keepOpenOnSelect={keepOpenOnSelect}
      selectedIds={selectedIds}
      fetchConfig={FETCH_CONFIG}
      useVariant={useDefaultVariant}
      maxHeight="65vh"
      data-testid="ProductDrawerShell__2e8824" />
  );
}
