/**
 * Stripe currency-unit conversion (ETP-5443 REVIEW N6).
 *
 * Deliberately its OWN file rather than folded into `upgrade/api.js`: this is pure currency
 * math with no HTTP client involved, and `upgrade/api.js` is wholesale-mocked by
 * `SubscriptionSection.vitest.jsx` (`vi.mock('@/lib/upgrade/api.js', () => ({...}))`) to stub
 * out the network calls — adding a non-HTTP export there would need that mock (and every other
 * future wholesale mock of that module) to keep re-exporting it too, for no benefit.
 */

/**
 * ISO 4217 codes Stripe represents in WHOLE units rather than the usual minor unit (cents):
 * `amountMinor` for one of these already IS the display amount, so dividing it by 100 — correct
 * for `EUR`/`USD`/most codes — understates it 100x (e.g. a ¥100 charge would read back as ¥1).
 * Per Stripe's zero-decimal currency list: https://docs.stripe.com/currencies#zero-decimal-currencies
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/**
 * Converts Stripe's `amountMinor` (always an integer, in the currency's smallest unit) into the
 * decimal amount `formatCurrency` expects to display. Never hand `amountMinor` to `formatCurrency`
 * directly — see {@link ZERO_DECIMAL_CURRENCIES} for why the divisor is not always 100.
 *
 * @param {string} currencyCode ISO 4217 code, e.g. from the same payload's `currency` field
 * @param {number|null|undefined} amountMinor
 * @returns {number|null}
 */
export function minorUnitsToAmount(currencyCode, amountMinor) {
  if (amountMinor == null || !Number.isFinite(amountMinor)) return null;
  const exponent = ZERO_DECIMAL_CURRENCIES.has(String(currencyCode).toUpperCase()) ? 0 : 2;
  return amountMinor / 10 ** exponent;
}
