import { toBcp47 } from './relativeTime.js';

/**
 * Formats an ISO instant as a numeric, locale-ordered date plus a 24h time in the viewer's local
 * timezone, e.g. `06/10/2026 11:45` (es) or `10/06/2026 11:45` (en-US). No comma between them.
 * This is an INSTANT formatter (it keeps the time of day); for date-only business dates
 * use `formatCalendarDate` from `dateOnly.js`.
 *
 * The locale decides the order and separators of day/month/year (Intl); day and month are always
 * 2-digit and the year 4-digit. The clock is always 24h (hourCycle h23), whatever the locale.
 *
 * @returns {string|null} null when `iso` is missing or not a valid date
 */
export function formatDateTime(iso, locale) {
  if (iso === null || iso === undefined || iso === '') return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const tag = toBcp47(locale);
  const datePart = new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat(tag, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${datePart} ${timePart}`;
}
