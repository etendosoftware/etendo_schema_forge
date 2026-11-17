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

/** Month / quarter to date. The fiscal year is `openingPeriod`. */
export function shortcutPeriod(kind, today) {
  const [y, m] = parts(today);
  if (kind === 'month') return { dateFrom: iso(y, m, 1), dateTo: today };
  if (kind === 'quarter') return { dateFrom: iso(y, m - (m % 3), 1), dateTo: today };
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
  return ['month', 'quarter'].find((k) => shortcutPeriod(k, today).dateFrom === period.dateFrom) || null;
}

const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();

/**
 * One calendar year back. The last day of February maps to the last day of February (28 Feb 2021 →
 * 29 Feb 2020, 29 Feb 2024 → 28 Feb 2023), so a February range loses no posting dated 29 Feb (ETP-6239 D2).
 */
function minusOneYear(day) {
  const [y, m, d] = parts(day);
  return iso(y - 1, m, m === 1 && d === lastDay(y, 1) ? lastDay(y - 1, 1) : d);
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

/**
 * D3: the same days shifted back `months`, the day clamped to the target month's length; a day that
 * is the last of its month stays the last of the target month (30 Jun → 31 Mar, 31 Mar → 28 Feb).
 */
function shiftBack(day, months) {
  const [y, m, d] = parts(day);
  const target = new Date(y, m - months, 1);
  const [ty, tm] = [target.getFullYear(), target.getMonth()];
  const len = lastDay(ty, tm);
  return iso(ty, tm, d === lastDay(y, m) ? len : Math.min(d, len));
}

/** D3: the previous calendar month (or quarter) of a bucket, keeping its days: 15–31 Mar → 15–28 Feb. */
export function previousCalendarBucket({ dateFrom, dateTo }, grain) {
  const months = grain === 'quarter' ? 3 : 1;
  return { from: shiftBack(dateFrom, months), to: shiftBack(dateTo, months) };
}

/**
 * The two ranges a period is compared with: same period last year, and the previous period. In
 * Total mode the previous period is the same number of days (`previousPeriod`); in Month / Quarter
 * mode it is the previous calendar bucket, which for the range itself is `[prev(first).from, prev(last).to]`.
 */
export function comparedRanges(period, grain) {
  const sly = { from: minusOneYear(period.dateFrom), to: minusOneYear(period.dateTo) };
  if (grain === 'total') {
    const prev = previousPeriod(period);
    return { sly, prev: { from: prev.fromReferenceDate, to: prev.toReferenceDate } };
  }
  return { sly, prev: previousCalendarBucket(period, grain) };
}

const bucketOf = (idx, dateFrom, dateTo, partial, grain) => ({ idx, dateFrom, dateTo, partial, ...comparedRanges({ dateFrom, dateTo }, grain) });

/** The calendar months (span 1) or quarters (span 3) touching the range, clipped to it. */
function calendarBuckets({ dateFrom, dateTo }, grain) {
  const span = grain === 'quarter' ? 3 : 1;
  const [fy, fm] = parts(dateFrom);
  const [ty, tm] = parts(dateTo);
  const out = [];
  for (let i = fy * 12 + fm - (fm % span); i <= ty * 12 + tm; i += span) {
    const [y, m] = [Math.floor(i / 12), i % 12];
    const start = iso(y, m, 1);
    const end = iso(y, m + span, 0);
    const from = start < dateFrom ? dateFrom : start;
    const to = end > dateTo ? dateTo : end;
    out.push({ from, to, partial: from !== start || to !== end });
  }
  return out;
}

/**
 * The buckets a report asks for (ETP-6239 D1/D3/D5): bucket 0 is the range itself, then the last
 * `maxShown` calendar months or quarters of it (all of them by default), each with its
 * same-last-year and previous ranges. `hiddenCount` is how many earlier buckets were left out;
 * `total` is bucket 0's compared ranges. `grain` is 'total' | 'month' | 'quarter'.
 */
export function periodBuckets({ dateFrom, dateTo }, grain, { maxShown = Infinity } = {}) {
  const total = bucketOf(0, dateFrom, dateTo, false, grain);
  const all = grain === 'total' ? [] : calendarBuckets({ dateFrom, dateTo }, grain);
  const shown = all.slice(-maxShown);
  return {
    buckets: [total, ...shown.map((b, i) => bucketOf(i + 1, b.from, b.to, b.partial, grain))],
    hiddenCount: all.length - shown.length,
    total: { sly: total.sly, prev: total.prev },
  };
}

/** The request's `periods`: `from..to|slyFrom..slyTo|prevFrom..prevTo` tuples, bucket 0 first. */
export const serializePeriods = (buckets) => buckets
  .map((b) => `${b.dateFrom}..${b.dateTo}|${b.sly.from}..${b.sly.to}|${b.prev.from}..${b.prev.to}`)
  .join(',');
