import { formatCurrency } from './formatCurrency.js';

const DEFAULT_LOCALE = 'es-ES';

/**
 * Format a numeric amount using the ISO currency code from the record data.
 *
 * Delegates to the canonical formatCurrency() for the currency-aware path
 * (es-ES locale, real resolved symbol, explicit thousands grouping). Falls
 * back to plain es-ES number formatting when no currency code is available.
 *
 * @param {number} value - The numeric amount to format.
 * @param {string|null|undefined} isoCode - ISO 4217 currency code (e.g. "USD").
 * @returns {string}
 */
export function formatAmount(value, isoCode) {
  if (value == null) return '—';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  if (isoCode) return formatCurrency(isoCode, num);
  return num.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
}
