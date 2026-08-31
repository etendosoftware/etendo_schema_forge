const DATE_ONLY_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;

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

export function getCalendarDateRelation(raw, reference = new Date()) {
  const date = parseCalendarDate(raw);
  if (!date) return null;

  const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const normalizedReference = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

  if (normalizedDate.getTime() < normalizedReference.getTime()) return 'past';
  if (normalizedDate.getTime() > normalizedReference.getTime()) return 'future';
  return 'today';
}
