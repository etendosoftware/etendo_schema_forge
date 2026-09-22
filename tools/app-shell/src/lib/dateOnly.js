const DATE_ONLY_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;

// A wall-clock timestamp is read in three flat pieces rather than one nested pattern, so no
// single expression trips SonarQube's regex-complexity limit (javascript:S5843).
//
// 1. The trailing zone designator (`Z` / `z`, `±hh:mm`, `±hhmm`) that this module deliberately
//    DISCARDS. Stripped up front instead of being matched-and-ignored at the tail.
const ZONE_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
// 2. The mandatory `yyyy-MM-dd` head.
const WALL_CLOCK_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
// 3. The optional `T`- or whitespace-separated time that may follow it, anchored so that anything
//    left over after the date is rejected exactly as the single combined pattern used to reject it.
const WALL_CLOCK_TIME_RE = /^[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/i;

function normalizeLocale(locales) {
  if (typeof locales === 'string') return locales.replace('_', '-');
  if (Array.isArray(locales)) return locales.map((locale) => normalizeLocale(locale));
  return locales;
}

export function parseCalendarDate(raw) {
  if (!raw) return null;

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? null
      : new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
  }

  const str = String(raw).trim();
  const match = str.match(DATE_ONLY_PREFIX_RE);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Reads a timestamp string's WALL CLOCK literally and rebuilds it with the
 * local-time constructor, **ignoring any trailing `Z` or `±hh:mm` offset**.
 * `'2026-01-01T14:30:00.000Z'` becomes 14:30 local, in every timezone.
 *
 * ## Why this exists
 *
 * Some AD config timestamps are authored as a wall-clock moment in the database
 * server's timezone and then serialized with a `Z` the server did not really mean.
 * Comparing such a value against a date-only business field is the trap: the
 * business field has no zone at all (`parseCalendarDate` gives it local midnight),
 * so parsing the config side with `new Date(...)` puts the two operands in
 * different reference frames and the comparison's result changes with the
 * viewer's timezone. That shipped as ETP-5046 — an invoice dated exactly on its
 * organization's TicketBAI adoption date was not offered for sending in
 * Europe/Madrid, while CI (UTC) saw nothing wrong.
 *
 * Reading the wall clock literally puts both operands in the same local frame, so
 * the comparison is timezone-independent AND still honours a real time-of-day —
 * which is what keeps the browser agreeing with server-side SQL that compares the
 * same two columns directly (`ETGO_GET_TBAI_STATUS`).
 *
 * ## What it deliberately ignores
 *
 * The zone designator, entirely. `...T14:30:00Z`, `...T14:30:00+02:00` and
 * `...T14:30:00` all yield the same local 14:30. No offset arithmetic happens.
 *
 * ## When NOT to use it
 *
 * **Never for a genuine instant** — an audit `Created` column, an email `sentAt`,
 * anything whose `Z` is truthful and that must order correctly across timezones.
 * Collapsing a real UTC instant to a local wall clock silently shifts it by the
 * host's offset. Use plain `new Date(raw)` and compare epoch millis for those;
 * see `isVerifactuEligibleByDate` in `windows/custom/shared/fiscalTargets.js` for
 * the contrasting case.
 *
 * A date-only string falls back to local midnight, identical to
 * {@link parseCalendarDate}. Falsy or unparseable input returns `null`, matching
 * this module's convention.
 *
 * @param {string|Date|null|undefined} raw
 * @returns {Date|null}
 */
export function parseWallClockInstant(raw) {
  if (!raw) return null;

  // A Date is already an instant — there is no wall-clock text to reinterpret, and
  // rebuilding one from local getters would be a no-op at best. Hand back a copy.
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : new Date(raw.getTime());
  }

  const str = String(raw).trim();
  const body = str.replace(ZONE_SUFFIX_RE, '');
  const date = body.match(WALL_CLOCK_DATE_RE);
  const rest = date ? body.slice(date[0].length) : '';
  const time = rest ? rest.match(WALL_CLOCK_TIME_RE) : null;
  // Not ISO-shaped (e.g. '03/05/2024'), or carrying trailing garbage the time pattern refuses:
  // fall back to the calendar-day reading rather than inventing a second parser here. The
  // ORIGINAL string is handed over, not the zone-stripped body.
  if (!date || (rest && !time)) return parseCalendarDate(str);

  // Digit counts only, as before: '2026-13-45T99:99:99' still parses, and the local-time
  // constructor rolls the overflow over. Range validation belongs upstream.
  const fraction = time?.[4];
  const millis = fraction ? Number(fraction.slice(0, 3).padEnd(3, '0')) : 0;
  return new Date(
    Number(date[1]),
    Number(date[2]) - 1,
    Number(date[3]),
    Number(time?.[1] ?? 0),
    Number(time?.[2] ?? 0),
    Number(time?.[3] ?? 0),
    millis,
  );
}

export function formatCalendarDate(
  raw,
  locales = 'en-GB',
  options = { day: '2-digit', month: '2-digit', year: 'numeric' },
) {
  const date = parseCalendarDate(raw);
  return date ? date.toLocaleDateString(normalizeLocale(locales), options) : '—';
}

/**
 * Today's date as a `yyyy-MM-dd` string, built from LOCAL calendar getters.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC-based: west of UTC (e.g.
 * America/Argentina/Buenos_Aires, UTC-3) it returns *yesterday* from ~21:00
 * local onward, and east of UTC it can return *tomorrow* late in the day.
 * Use this instead whenever "today" is compared against a date-only field.
 */
export function todayCalendarISO(reference = new Date()) {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  const day = String(reference.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Tomorrow's date as a `yyyy-MM-dd` string, in the LOCAL calendar.
 *
 * Built with the local-time `Date` constructor, which rolls the month and year
 * over correctly and is immune to DST shifts — unlike adding 86400000 ms, which
 * lands on the same calendar day when the clock falls back an hour.
 *
 * Useful for expressing "on or before today" against a date-only field where
 * only a strict `lessThan` operator is available: `< tomorrow` is `<= today`.
 */
export function tomorrowCalendarISO(reference = new Date()) {
  return todayCalendarISO(
    new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1),
  );
}

/**
 * The date `days` before `reference`, as a `yyyy-MM-dd` string in the LOCAL calendar.
 *
 * Built with the local-time `Date` constructor for the same reasons as `tomorrowCalendarISO`: it
 * rolls month and year boundaries over correctly and is immune to DST shifts, unlike subtracting
 * `days * 86400000` ms, which lands on the wrong calendar day across a clock change.
 *
 * Intended for "how far back may we look" bounds that are then compared against a date-only
 * field, where both sides must be local calendar days. Compare the result with a stored
 * `yyyy-MM-dd` value using plain string comparison — ISO date-only strings order
 * lexicographically, so no `Date` needs to be built for the comparison itself.
 */
export function calendarISODaysAgo(days, reference = new Date()) {
  return todayCalendarISO(
    new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - days),
  );
}

/**
 * Formats a calendar month and two-digit year without locale-specific connector words, so fiscal
 * period labels consistently read "January 27" / "Enero 27" rather than persisted "Jan-27".
 */
export function formatCalendarMonthYear(raw, locales = 'en-GB') {
  const date = parseCalendarDate(raw);
  if (!date) return '—';
  const formatter = new Intl.DateTimeFormat(normalizeLocale(locales), {
    month: 'long', year: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value;
  const year = parts.find((part) => part.type === 'year')?.value;
  if (!month || !year) return formatter.format(date);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`;
}

export function getCalendarDateRelation(raw, reference = new Date()) {
  const date = parseCalendarDate(raw);
  if (!date) return null;

  const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const normalizedReference = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

  if (normalizedDate.getTime() < normalizedReference.getTime()) return 'past';
  if (normalizedDate.getTime() > normalizedReference.getTime()) return 'future';
  return 'today';
}
