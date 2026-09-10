/**
 * Locale-aware date/amount formatters shared by the financial-account window
 * and the reconciliation split panel. Single source of truth — do NOT copy
 * these into individual components.
 */
import { formatCurrency } from './formatCurrency.js';
import { formatCalendarDate } from './dateOnly.js';

/**
 * Formats a business date, delegating to the canonical `formatCalendarDate`:
 * it reads the leading `yyyy-MM-dd` and builds the Date with the LOCAL-time
 * constructor, so the calendar day survives any host offset and any wire shape
 * (with or without a zone suffix).
 *
 * It used to be `new Date(iso)` + `Intl.DateTimeFormat(..., timeZone: 'UTC')`,
 * on the premise that the backend always sent UTC midnight. ETP-5100 removed
 * that premise (NEO now emits the civil `yyyy-MM-dd'T'HH:mm:ss` in the server's
 * own zone), and the two UTC assumptions then stacked instead of cancelling:
 * `new Date("2026-09-01T22:59:10")` parses as LOCAL, and rendering that instant
 * back in UTC pushed it to the next day.
 *
 * @param {string} iso - ISO date/datetime string.
 * @param {string} bcpLocale - BCP-47 locale (e.g. "es-ES").
 * @returns {string} `dd/mm/yyyy` in the given locale, or '—' for falsy/invalid.
 */
export function formatDate(iso, bcpLocale) {
  return formatCalendarDate(iso, bcpLocale);
}

/**
 * Formats a signed money value as a `±X,XX €` string (delegates to the shared
 * `formatCurrency()` for the actual number/symbol formatting) for action bars /
 * footers: the absolute value is currency-formatted and a leading '-' / '+'
 * sign is prepended.
 *
 * @param {number|string} amount
 * @param {string} currency - ISO 4217 currency code.
 * @returns {string}
 */
export function formatSigned(amount, currency) {
  const num = Number(amount) || 0;
  const sign = num < 0 ? '-' : '+';
  return sign + formatCurrency(currency, Math.abs(num));
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
 *   (positive/negative/neutral semantic theme roles).
 */
export function formatSignedDelta(value) {
  const num = Number(value) || 0;
  if (num === 0) return { text: '±0', tone: 'neutral' };
  if (num < 0) return { text: `-${Math.abs(num)}`, tone: 'negative' };
  return { text: `+${num}`, tone: 'positive' };
}
