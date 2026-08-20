import { BoxIcon } from '@/components/ui/box-icon';
import { formatCurrency } from '@/lib/formatCurrency.js';

/* eslint-disable react/prop-types */

// BoxIcon now lives in a shared util (@/components/ui/box-icon) so the
// generic `multiField` renderer and Product cells share one glyph. Re-exported
// here to keep existing importers (ProductGallery, tests) working unchanged.
export { BoxIcon };

// eStock / eSalePrice / ePurchasePrice are STORED COMPUTED columns (EPL-1807):
// they are materialized on M_Product and returned by the product LIST fetch as
// `row.eTGOStock` / `row.eTGOSalePrice` / `row.eTGOPurchasePrice`. The list no
// longer issues per-row `/stock` and `/price` sub-requests — the values arrive
// with the row, so the whole grid paints in one pass instead of filling in late.
//
// The DB functions ETGO_PRODUCT_SALE_PRICE / _PURCHASE_PRICE / _STOCK apply the
// exact selection the client used to do inline (default sales/purchase price
// list, current-or-past version, most recent, deterministic tie-break; stock =
// sum of quantityOnHand). Sale/purchase are refreshed synchronously (always
// fresh); stock is refreshed by the queue drain (may lag a few minutes — hence
// the freshness clock in the Stock column header).

/** Coerce an Etendo numeric field to a finite number, or null when absent/blank. */
function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function PriceText({ value, bold }) {
  if (value === undefined || value === null) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  // Currency hardcoded to EUR: the list row carries no currency-code field today
  // (ETGO_PRODUCT_SALE_PRICE/_PURCHASE_PRICE return a bare number) — using the
  // real price-list currency is a separate, already-tracked bug (ETP-4314 test
  // case #12), out of scope here. This fix is scoped to the decimal separator
  // QA reported (46.00 € instead of 46,00 €) — routing through formatCurrency()
  // instead of a raw .toFixed(2) fixes that without touching the symbol bug.
  return (
    <span className={`text-sm text-[hsl(var(--foreground))] whitespace-nowrap${bold ? ' font-semibold' : ''}`}>
      {formatCurrency('EUR', value)}
    </span>
  );
}

export function ProductSalePriceCell({ row }) {
  return <PriceText value={toNumberOrNull(row?.eTGOSalePrice)} bold data-testid="PriceText__fed565" />;
}

export function ProductPurchasePriceCell({ row }) {
  return <PriceText value={toNumberOrNull(row?.eTGOPurchasePrice)} data-testid="PriceText__fed565" />;
}

export function ProductStockCell({ row }) {
  const stock = toNumberOrNull(row?.eTGOStock);
  if (stock === null) return <span className="text-muted-foreground text-sm">—</span>;
  return <span className="text-sm text-[hsl(var(--foreground))]">{stock}</span>;
}
