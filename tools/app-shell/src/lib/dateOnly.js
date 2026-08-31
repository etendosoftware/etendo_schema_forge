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
