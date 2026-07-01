import { useState, useEffect } from 'react';
import { useProductImage } from './useProductImage';

/* eslint-disable react/prop-types */

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

export function BoxIcon({ size = 24, color = '#828FA3' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 8L12 3L3 8M21 8V16L12 21M21 8L12 13M3 8V16L12 21M3 8L12 13M12 21V13" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProductNameCell({ row, token, apiBaseUrl }) {
  const imgSrc = useProductImage(row.image, token, apiBaseUrl);

  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-[#F5F7F9] flex items-center justify-center overflow-hidden flex-shrink-0">
        {imgSrc
          ? <img src={imgSrc} alt={row.name} className="w-full h-full object-cover" />
          : <BoxIcon data-testid="BoxIcon__fed565" />
        }
      </div>
      <div className="flex flex-col justify-center gap-0.5">
        <span className="text-sm font-semibold text-[#121217] leading-5">{row.name}</span>
        {row.searchKey && (
          <span className="inline-flex items-center px-2 py-0.5 bg-[#F5F7F9] rounded-full text-xs text-[#3F3F50] leading-4 w-fit">
            {row.searchKey}
          </span>
        )}
      </div>
    </div>
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
