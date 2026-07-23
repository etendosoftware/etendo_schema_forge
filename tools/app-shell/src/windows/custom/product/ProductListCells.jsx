import { useState, useEffect } from 'react';
import { BoxIcon } from '@/components/ui/box-icon';

/* eslint-disable react/prop-types */

// BoxIcon now lives in a shared util (@/components/ui/box-icon) so the
// generic `multiField` renderer and Product cells share one glyph. Re-exported
// here to keep existing importers (ProductGallery, tests) working unchanged.
export { BoxIcon };

/** Etendo CHAR(1)/string boolean → JS boolean. */
function isTruthyFlag(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', 'y', 'yes', '1'].includes(v.toLowerCase());
  return false;
}

/**
 * Pick the price row to display for one side (sales or purchase) from the list
 * returned by the `/price` endpoint.
 *
 * Rules (mirror the Etendo pricing engine):
 *  1. Keep only rows of the requested side (`priceListVersion$salesPriceList`).
 *  2. Among rows whose Price List is marked Default (`priceListVersion$default`),
 *     keep the most recent `validFromDate` that is <= today; if none is <= today,
 *     keep the most recent overall.
 *  3. If no default exists on that side, fall back to the first available row.
 *  4. If the side has no rows, return null.
 *
 * @param {Array<object>} rows price rows from the API
 * @param {{ sales: boolean }} opts side selector
 * @param {Date} [now] injectable "today" for deterministic tests
 * @returns {object|null} the chosen price row
 */
export function selectPriceRow(rows, { sales }, now = new Date()) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const sideRows = rows.filter((r) => isTruthyFlag(r['priceListVersion$salesPriceList']) === sales);
  if (sideRows.length === 0) return null;

  const defaults = sideRows.filter((r) => isTruthyFlag(r['priceListVersion$default']));
  if (defaults.length === 0) return sideRows[0];

  const todayTs = now.getTime();
  const ts = (r) => {
    const d = new Date(r['priceListVersion$validFromDate']);
    return Number.isNaN(d.getTime()) ? -Infinity : d.getTime();
  };

  const validNow = defaults.filter((r) => ts(r) <= todayTs);
  const pool = validNow.length > 0 ? validNow : defaults;
  return pool.reduce((best, r) => (ts(r) > ts(best) ? r : best), pool[0]);
}

// In-flight request dedup: the Sale and Purchase cells of the same row both need
// `/price?parentId=<id>`. Sharing the promise avoids a double network hit. The
// entry is removed once the request settles so later re-renders refetch fresh data.
const inFlightPrices = new Map();

function fetchProductPrices(productId, token, apiBaseUrl) {
  const cacheKey = `${apiBaseUrl}|${productId}`;
  const pending = inFlightPrices.get(cacheKey);
  if (pending) return pending;

  const promise = fetch(`${apiBaseUrl}/price?parentId=${productId}&_startRow=0&_endRow=200`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => data?.response?.data ?? [])
    .catch(() => [])
    .finally(() => inFlightPrices.delete(cacheKey));

  inFlightPrices.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch a product's price rows once and derive the sale and purchase unit prices
 * (standardPrice of the chosen row per side). Returns `undefined` values while
 * loading, `null` when the side has no price.
 *
 * @returns {{ sale: number|null|undefined, purchase: number|null|undefined }}
 */
export function useProductPrices(productId, token, apiBaseUrl) {
  const [prices, setPrices] = useState({ sale: undefined, purchase: undefined });

  useEffect(() => {
    if (!productId) {
      setPrices({ sale: null, purchase: null });
      return undefined;
    }
    let active = true;
    fetchProductPrices(productId, token, apiBaseUrl).then((rows) => {
      if (!active) return;
      const sale = selectPriceRow(rows, { sales: true });
      const purchase = selectPriceRow(rows, { sales: false });
      setPrices({
        sale: sale ? Number(sale.standardPrice) || 0 : null,
        purchase: purchase ? Number(purchase.standardPrice) || 0 : null,
      });
    });
    return () => { active = false; };
  }, [productId, token, apiBaseUrl]);

  return prices;
}

function PriceText({ value, bold }) {
  if (value === undefined || value === null) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <span className={`text-sm text-[#121217] whitespace-nowrap${bold ? ' font-semibold' : ''}`}>
      {value.toFixed(2)} €
    </span>
  );
}

export function ProductSalePriceCell({ row, token, apiBaseUrl }) {
  const { sale } = useProductPrices(row.id, token, apiBaseUrl);
  return <PriceText value={sale} bold data-testid="PriceText__fed565" />;
}

export function ProductPurchasePriceCell({ row, token, apiBaseUrl }) {
  const { purchase } = useProductPrices(row.id, token, apiBaseUrl);
  return <PriceText value={purchase} data-testid="PriceText__fed565" />;
}

export function ProductStockCell({ row, token, apiBaseUrl }) {
  const [stock, setStock] = useState(undefined);

  useEffect(() => {
    if (!row.id) return;
    fetch(`${apiBaseUrl}/stock?parentId=${row.id}&_startRow=0&_endRow=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const rows = data?.response?.data ?? [];
        setStock(rows.reduce((s, r) => s + (Number(r.quantityOnHand) || 0), 0));
      })
      .catch(() => setStock(null));
  }, [row.id, token, apiBaseUrl]);

  if (stock === undefined) return <span className="text-muted-foreground text-sm">—</span>;
  if (stock === null) return <span className="text-muted-foreground text-sm">—</span>;
  return <span className="text-sm text-[#121217]">{stock}</span>;
}
