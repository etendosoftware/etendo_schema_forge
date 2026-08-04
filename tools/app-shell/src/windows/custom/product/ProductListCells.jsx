import { BoxIcon } from '@/components/ui/box-icon';

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
  return (
    <span className={`text-sm text-[hsl(var(--foreground))] whitespace-nowrap${bold ? ' font-semibold' : ''}`}>
      {value.toFixed(2)} €
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
