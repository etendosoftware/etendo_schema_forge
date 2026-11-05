import { parseCalendarDate, todayCalendarISO } from '@/lib/dateOnly.js';

/**
 * ETP-6080 §19 — the dynamic view's period. Every value is a local calendar day `yyyy-MM-dd`;
 * ISO date strings order lexicographically, so ranges compare as plain strings.
 */

const iso = (y, m, d) => todayCalendarISO(new Date(y, m, d));
const parts = (raw) => {
  const d = parseCalendarDate(raw);
  return [d.getFullYear(), d.getMonth(), d.getDate()];
};

/** The fiscal year row (`{id, startDate, endDate}`) whose range contains `day`, or null. */
export function yearContaining(years, day) {
  return (years || []).find((y) => y.startDate && y.endDate && y.startDate <= day && day <= y.endDate) || null;
}

/**
 * The period the view opens on: the fiscal year that contains today, from its first day to today.
 * No such year (or no calendar for the org): 1 January to today, flagged `noFiscalYear` so the
 * view can say so. The query runs either way.
 */
export function openingPeriod(years, today) {
  const year = yearContaining(years, today);
  if (year) return { dateFrom: year.startDate, dateTo: today, yearId: year.id, noFiscalYear: false };
  return { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today, yearId: null, noFiscalYear: true };
}

/** A year picked by hand: a closed year fills its whole range; the year that contains today stops at today. */
export function pickedYearPeriod(year, today) {
  const contains = year.startDate <= today && today <= year.endDate;
  return { dateFrom: year.startDate, dateTo: contains ? today : year.endDate };
}

/** Month / quarter to date, and the last 12 months ending today. The fiscal year is `openingPeriod`. */
export function shortcutPeriod(kind, today) {
  const [y, m, d] = parts(today);
  if (kind === 'month') return { dateFrom: iso(y, m, 1), dateTo: today };
  if (kind === 'quarter') return { dateFrom: iso(y, m - (m % 3), 1), dateTo: today };
  if (kind === 'last12') return { dateFrom: iso(y - 1, m, d + 1), dateTo: today };
  throw new Error(`Unknown period shortcut: ${kind}`);
}

/** The fiscal year the period is exactly (as `pickedYearPeriod` fills it), so the selector can show it; else null. */
export function matchingYear(period, years, today) {
  return (years || []).find((y) => {
    const { dateFrom, dateTo } = pickedYearPeriod(y, today);
    return period?.dateFrom === dateFrom && period?.dateTo === dateTo;
  }) || null;
}

/** Which shortcut (if any) the period matches, so the panel can show it as selected. */
export function matchingShortcut(period, years, today) {
  if (!period?.dateFrom || period.dateTo !== today) return null;
  const year = yearContaining(years, today);
  if (year && period.dateFrom === year.startDate) return 'year';
  return ['month', 'quarter', 'last12'].find((k) => shortcutPeriod(k, today).dateFrom === period.dateFrom) || null;
}

/** One calendar year back; 29 February becomes 28 February (§19.2: no day offsets). */
function minusOneYear(day) {
  const [y, m, d] = parts(day);
  return iso(y - 1, m, m === 1 && d === 29 ? 28 : d);
}

/** "Same period last year": each bound one calendar year back. */
export function samePeriodLastYear({ dateFrom, dateTo }) {
  return { fromReferenceDate: minusOneYear(dateFrom), toReferenceDate: minusOneYear(dateTo) };
}

/** "Previous period": the same number of days, ending the day before `dateFrom`. */
export function previousPeriod({ dateFrom, dateTo }) {
  const [fy, fm, fd] = parts(dateFrom);
  const days = Math.round((parseCalendarDate(dateTo) - parseCalendarDate(dateFrom)) / 86400000);
  return { fromReferenceDate: iso(fy, fm, fd - 1 - days), toReferenceDate: iso(fy, fm, fd - 1) };
}

/** The reference period for a comparison mode (`same-last-year` / `previous`), or null for none. */
export function comparisonPeriod(mode, period) {
  if (!period?.dateFrom || !period?.dateTo) return null;
  if (mode === 'same-last-year') return samePeriodLastYear(period);
  if (mode === 'previous') return previousPeriod(period);
  return null;
}
