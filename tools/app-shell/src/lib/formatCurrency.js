const DEFAULT_LOCALE = 'en-US';

/**
 * Currencies that place the symbol AFTER the amount with a space: "1,234.56 €"
 * All other currencies place the symbol before: "$1,234.56"
 *
 * Add codes here when a new currency needs symbol-after formatting.
 */
const SYMBOL_AFTER_CURRENCIES = new Set(['EUR', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF', 'PLN']);

/**
 * Format a numeric value as a currency string using an ISO 4217 currency code.
 *
 * This is the canonical shared currency formatting utility for the app shell.
 * Use this function for all new money formatting — it is designed as the stable
 * base for future locale-aware formatting without requiring call site changes.
 *
 * Symbol placement rules:
 *   - Currencies in SYMBOL_AFTER_CURRENCIES → symbol after amount with a space: "1,234.56 €"
 *   - All other currencies → symbol before amount: "$1,234.56"
 *
 * @param {string} currencyCode - ISO 4217 currency code (e.g. "USD", "EUR", "ARS").
 * @param {number|string|null|undefined} value - The numeric amount to format.
 * @param {object} [options]
 * @param {boolean} [options.compact=false] - Use compact notation (e.g. "$12.5K" instead of
 *   "$12,500.00"). Additive/backward-compatible — omitting the third argument entirely keeps
 *   every existing call site's output unchanged.
 * @returns {string} Formatted currency string, or '—' for invalid/missing values.
 *
 * @example
 * formatCurrency('USD', 1234.5)   // '$1,234.50'
 * formatCurrency('EUR', 1234.5)   // '1,234.50 €'
 * formatCurrency('EUR', -99.9)    // '-99.90 €'
 * formatCurrency('XYZ', 99)       // '99.00'  (unknown code falls back to numeric)
 * formatCurrency('USD', null)     // '—'
 * formatCurrency('USD', 12500, { compact: true }) // '$12.5K'
 */
export function formatCurrency(currencyCode, value, { compact = false } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return '\u2014';

  const amount = Number(value);
  const notation = compact ? 'compact' : 'standard';

  try {
    const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      notation,
    });

    // Symbol-after convention: amount first, then symbol with a space ("1,234.56 €")
    if (SYMBOL_AFTER_CURRENCIES.has(currencyCode)) {
      const symbol = formatter.formatToParts(0).find((p) => p.type === 'currency')?.value ?? currencyCode;
      const numFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        notation,
      });
      const sign = amount < 0 ? '-' : '';
      return `${sign}${numFormatter.format(Math.abs(amount))} ${symbol}`;
    }

    // All other currencies: symbol before amount ("$1,234.56")
    return formatter.format(amount);
  } catch {
    return amount.toLocaleString(DEFAULT_LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
