import { formatCurrency } from '@/lib/formatCurrency.js';

/**
 * ETP-6050 S2 — an amount of the review panel in the document's currency with exactly its decimals
 * (`currency.scale`: 0 for a JPY-like currency, 2 usually) as min / max fraction digits. It goes through
 * the canonical `formatCurrency` (grouping, symbol, separators); only the digits are chosen here.
 *
 * @param {string} currency ISO code
 * @param {number|string|null} value
 * @param {number} [scale=2]
 * @param {{maxDigits?: number}} [options] `maxDigits` > scale shows up to that many decimals (unit prices: 6)
 */
export function formatMoney(currency, value, scale = 2, { maxDigits = scale } = {}) {
  return formatCurrency(currency, value, {
    minimumFractionDigits: scale,
    maximumFractionDigits: Math.max(scale, maxDigits),
  });
}
