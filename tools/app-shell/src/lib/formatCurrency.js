const DEFAULT_LOCALE = 'es-ES';

/**
 * Format a numeric value as a currency string using an ISO 4217 currency code.
 *
 * This is the canonical shared currency formatting utility for the app shell.
 * Use this function for all new money formatting — it is designed as the stable
 * base for future locale-aware formatting without requiring call site changes.
 *
 * Locale: `es-ES`. Native `Intl` already places the currency symbol after the
 * amount for every currency under this locale, so no manual symbol-placement
 * logic is needed.
 *
 * `useGrouping: true` is explicit and required — some `Intl` implementations
 * silently drop the thousands separator for `style: 'currency'` when it is
 * left at its default, so this is not merely stylistic.
 *
 * @param {string} currencyCode - ISO 4217 currency code (e.g. "USD", "EUR", "ARS").
 * @param {number|string|null|undefined} value - The numeric amount to format.
 * @param {object} [options]
 * @param {boolean} [options.compact=false] - Use compact notation (e.g. "12,5 mil €" instead of
 *   "12.500,00 €"). Additive/backward-compatible — omitting the third argument entirely keeps
 *   every existing call site's output unchanged.
 * @returns {string} Formatted currency string, or '—' for invalid/missing values.
 *
 * @example
 * formatCurrency('EUR', 1234.5)   // '1.234,50 €'
 * formatCurrency('USD', 1234.5)   // '1.234,50 $'
 * formatCurrency('EUR', -99.9)    // '-99,90 €'
 * formatCurrency('XYZ', 99)       // '99,00 XYZ'  (unrecognized code — Intl shows it as-is)
 * formatCurrency('USD', null)     // '—'
 * formatCurrency('EUR', 12500, { compact: true }) // '12,50 mil €'
 */
/**
 * Resolves a currency's real narrow symbol (e.g. "€", "$", "£") via Intl, with no
 * hardcoded currency→symbol map. Falls back to the raw code if Intl can't resolve
 * a distinct symbol, and to '' when no currency is given.
 *
 * @param {string} [currencyCode] - ISO 4217 currency code (e.g. "USD", "EUR").
 * @returns {string}
 *
 * @example
 * getCurrencySymbol('EUR')   // '€'
 * getCurrencySymbol('USD')   // '$'
 * getCurrencySymbol()        // ''
 */
export function getCurrencySymbol(currencyCode) {
  if (!currencyCode) return '';
  try {
    return new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency: currencyCode, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value || currencyCode;
  } catch {
    return currencyCode;
  }
}

export function formatCurrency(currencyCode, value, { compact = false } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return '—';

  const amount = Number(value);
  const notation = compact ? 'compact' : 'standard';

  try {
    const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
      notation,
    });

    return formatter.format(amount);
  } catch {
    return amount.toLocaleString(DEFAULT_LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    });
  }
}
