/**
 * Instants — a moment something happened, as opposed to a business date.
 *
 * The counterpart of `dateOnly.js`, and the distinction is the whole point of having both:
 *
 *  - A **business date** (invoice date, payment date) is a calendar day. It must read the same
 *    everywhere, so `dateOnly.js` deliberately ignores time zones — shifting it would move a
 *    document to another day for a viewer in another country.
 *  - An **instant** (created at, updated at, confirmed at) is a point in time. It must be shown in
 *    the viewer's own clock, so ignoring the zone is exactly the bug: an activity row recorded at
 *    08:32 in Argentina displayed as 11:32, because the server's UTC digits were planted verbatim
 *    as local time (ETP-4895).
 *
 * <b>Why a zone-less string is read as UTC.</b> NEO's wire format for a datetime property carries
 * no zone at all — `yyyy-MM-dd'T'HH:mm:ss`, see `NeoDateFormat` in com.etendoerp.go — so the value
 * cannot say which clock it was written on. Reading it as UTC is right while the servers run UTC,
 * which is what this assumes, and it is stated here rather than buried in a component so there is
 * one place to revisit when NEO starts emitting the zone. A string that DOES carry a zone (`Z` or
 * an offset) is parsed as-is and this assumption never applies to it.
 */

/** `yyyy-MM-dd` with a time but no `Z` and no `±HH:mm` — the shape NEO emits. */
const ZONELESS_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)$/;

/** True when the value carries a time of day at all, as opposed to being a bare calendar date. */
export function hasTimeOfDay(raw) {
  return !!raw && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(String(raw).trim());
}

/**
 * The moment `raw` refers to, or `null` when it does not refer to one.
 *
 * A date-only value returns `null` on purpose: it is a business date, and forcing it through here
 * would peg it to midnight UTC — which lands on the previous day for anyone west of Greenwich, the
 * very shift `dateOnly.js` exists to prevent. Callers that can receive either must ask
 * {@link hasTimeOfDay} and route to `parseCalendarDate` instead.
 *
 * @param {string|Date|null} raw an ISO datetime, with or without a zone
 * @returns {Date|null}
 */
export function parseInstant(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;

  const str = String(raw).trim();
  const zoneless = ZONELESS_DATETIME_RE.exec(str);
  const parsed = zoneless
    ? new Date(`${zoneless[1]}T${zoneless[2]}Z`)
    : new Date(str);

  if (Number.isNaN(parsed.getTime())) return null;
  // A bare calendar date parses fine as midnight UTC; refuse it rather than shift its day.
  return hasTimeOfDay(str) ? parsed : null;
}

/**
 * `raw` in the viewer's own clock, as `28 ago 2026 · 08:32`.
 *
 * @param {string|Date|null} raw the instant
 * @param {string} locales locale for the date half
 * @param {object} options `toLocaleDateString` options for the date half
 * @returns {string} the formatted instant, or `''` when there is none
 */
export function formatInstant(
  raw,
  locales = 'es-ES',
  options = { day: 'numeric', month: 'short', year: 'numeric' },
) {
  const date = parseInstant(raw);
  if (!date) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.toLocaleDateString(locales, options)} · ${hours}:${minutes}`;
}
