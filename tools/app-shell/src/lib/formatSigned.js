/**
 * Locale-aware date/amount formatters shared by the financial-account window
 * and the reconciliation split panel. Single source of truth — do NOT copy
 * these into individual components.
 */

/**
 * Formats an ISO date string in UTC. The backend sends date-only values as UTC
 * midnight, so formatting in UTC avoids a negative-offset timezone shifting the
 * calendar day.
 *
 * @param {string} iso - ISO date/datetime string.
 * @param {string} bcpLocale - BCP-47 locale (e.g. "es-ES").
 * @returns {string} `dd/mm/yyyy` in the given locale, or '—' for falsy/invalid.
 */
export function formatDate(iso, bcpLocale) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(bcpLocale, {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(d);
}

/**
 * Formats a signed money value as a `±X,XX €` string (always es-ES currency
 * formatting) for action bars / footers: the absolute value is currency-
 * formatted and a leading '-' / '+' sign is prepended.
 *
 * @param {number|string} amount
 * @param {string} currency - ISO 4217 currency code.
 * @returns {string}
 */
export function formatSigned(amount, currency) {
  const abs = Math.abs(Number(amount) || 0);
  const formatted = new Intl.NumberFormat('es-ES', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(abs);
  return (Number(amount) < 0 ? '-' : '+') + formatted;
}

/**
 * Formats a signed plain (non-currency) numeric delta for the `signedDelta`
 * lines-grid column type (e.g. physical-inventory's "Difference" column).
 * Deliberately does NOT apply thousands grouping — sibling quantity columns
 * in the same lines grid (bookQuantity, quantityCount) render their raw
 * numeric value with no Intl formatting, so this stays consistent with them
 * instead of hand-rolling a grouped format that would look out of place
 * next to `1500`, `1600`.
 *
 * @param {number|string} value
 * @returns {{ text: string, tone: 'positive'|'negative'|'neutral' }}
 *   `text` is `±0` for exactly zero, `+N` for positive, `-N` for negative.
 *   `tone` maps 1:1 to the TONE_CLASS keys in components/ui/money-amount.jsx
 *   (positive #1E874C, negative #d50b3e, neutral #121217).
 */
export function formatSignedDelta(value) {
  const num = Number(value) || 0;
  if (num === 0) return { text: '±0', tone: 'neutral' };
  if (num < 0) return { text: `-${Math.abs(num)}`, tone: 'negative' };
  return { text: `+${num}`, tone: 'positive' };
}
