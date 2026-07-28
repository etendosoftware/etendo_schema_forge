import { getCurrencyFormatConfig } from './currencyFormatConfig.js';

const DEFAULT_LOCALE = 'es-ES';

/**
 * Manual grouping algorithm (no `Intl.NumberFormat`), parameterized by the
 * instance-wide separators from `currencyFormatConfig.js`. Mirrors the same
 * approach used server-side for the jsreport payload (`__groupEsEs` in
 * `templates/reports/helpers/report-html-helpers.js`) — both sides read from
 * one config instead of hardcoding separators independently (ETP-4314).
 */
function groupWithSeparators(num, minFrac, maxFrac, thousandsSeparator, decimalSeparator) {
  // `num < 0` is false for -0 (it's numerically equal to 0) — Intl.NumberFormat
  // renders -0 with a minus sign regardless, so check for it explicitly too.
  const sign = (num < 0 || Object.is(num, -0)) ? '-' : '';
  const abs = Math.abs(num);
  const fixed = abs.toFixed(maxFrac);
  const [intRaw, decRaw = ''] = fixed.split('.');
  const intPart = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  let decPart = decRaw;
  while (decPart.length > minFrac && decPart.endsWith('0')) {
    decPart = decPart.slice(0, -1);
  }
  return decPart ? `${sign}${intPart}${decimalSeparator}${decPart}` : `${sign}${intPart}`;
}

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

  if (compact) {
    // Deliberately still Intl-driven, es-ES fixed — compact notation (magnitude
    // detection + "mil"/"M"/"B" style suffixes) has exactly one real caller today
    // (NewPaymentEntryModal.jsx via MoneyAmount); reimplementing that logic by
    // hand for a single call site is out of scope for the separator-config work
    // (ETP-4314). The standard (non-compact) path below is the one that matters.
    try {
      const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
        style: 'currency',
        currency: currencyCode,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
        notation: 'compact',
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

  const { thousandsSeparator, decimalSeparator } = getCurrencyFormatConfig();
  const formattedNumber = groupWithSeparators(amount, 2, 2, thousandsSeparator, decimalSeparator);

  // Validate currencyCode the same way the old single combined Intl.NumberFormat
  // call did — an invalid/missing code throws here (e.g. undefined, or a
  // malformed string), matching the original fallback (plain grouped number,
  // no symbol at all). getCurrencySymbol() has its OWN separate fallback (the
  // raw code as text) which only kicks in for a well-formed-but-unrecognized
  // code — the two must not be conflated.
  try {
    // eslint-disable-next-line no-new -- validity check only, result unused
    new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency: currencyCode });
  } catch {
    return formattedNumber;
  }

  const symbol = getCurrencySymbol(currencyCode);
  // NBSP (U+00A0), not a plain space — matches what Intl's `currencyDisplay:
  // 'narrowSymbol'` always inserted between amount and symbol under es-ES.
  return symbol ? `${formattedNumber} ${symbol}` : formattedNumber;
}
