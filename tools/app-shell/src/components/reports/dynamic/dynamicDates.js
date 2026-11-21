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

/** First day of the fiscal year containing `day`; no such year (no calendar for the org): 1 January, as `openingPeriod`. */
export function fiscalYearStart(years, day) {
  return yearContaining(years, day)?.startDate ?? `${day.slice(0, 4)}-01-01`;
}

/** Last day of the latest fiscal year that ended before `day` (the last COMPLETED year, never assuming 31/12), or null. */
export function lastCompletedYearEnd(years, day) {
  const ends = (years || []).filter((y) => y.endDate && y.endDate < day).map((y) => y.endDate);
  return ends.length ? ends.sort().pop() : null;
}

/**
 * ETP-6083 — the end dates a report offers on its Hasta (`dateTo.shortcuts` in the contract): today, and the end of
 * the last COMPLETED month / quarter / fiscal year. The fiscal year comes from the calendar (`years`), never 31/12.
 * Null when the date does not exist yet (no completed fiscal year).
 */
export function endShortcutDate(kind, today, years) {
  const [y, m] = parts(today);
  if (kind === 'today') return today;
  if (kind === 'lastMonthEnd') return iso(y, m, 0);
  if (kind === 'lastQuarterEnd') return iso(y, m - (m % 3), 0);
  if (kind === 'lastFiscalYearEnd') return lastCompletedYearEnd(years, today);
  throw new Error(`Unknown end-date shortcut: ${kind}`);
}

/** Which of the offered end shortcuts `dateTo` equals, or null (so the panel can show it as selected). */
export function matchingEndShortcut(dateTo, kinds, today, years) {
  return (kinds || []).find((k) => dateTo && endShortcutDate(k, today, years) === dateTo) ?? null;
}

/**
 * ETP-6083 — a report whose Desde is the ledger start (`dateFrom.role = 'ledgerStart'`): it never changes the
 * amounts (a balance at Hasta), only where the ledger drill starts. Always inside the fiscal year of Hasta, so
 * opening + movements = the balance: a value outside [year start, Hasta] is brought back to the year start.
 */
export function ledgerStartFor(years, dateFrom, dateTo) {
  const yearStart = fiscalYearStart(years, dateTo);
  return !dateFrom || dateFrom < yearStart || dateFrom > dateTo ? yearStart : dateFrom;
}

/** The balance on `day` as a one-day range: the shape the period queries take (cumulative, they ignore `from`). */
const atDay = (day) => ({ from: day, to: day });

/**
 * ETP-6083 — "compare" rules declared by the contract (`compareTo.compareModes`) for a report that is a balance AT A DATE:
 * `sly` = 'sameDateLastYear' (the day one year back) and `prev` = 'previousFiscalYearClose' (the end of the fiscal year
 * before the one containing the date). Each is a one-day range. Null (the P&L) keeps the period-shaped comparisons.
 */
export function compareRulesOf(compareModes, years) {
  if (!compareModes) return null;
  return { modes: compareModes, years };
}

/** The day each comparison mode of `rules` compares `day` with (`{ sly, prev }`, null where it has none): for the panel's labels. */
export function compareDates(rules, day) {
  const { sly, prev } = dateRanges(rules, day);
  return { sly: sly?.to ?? null, prev: prev?.to ?? null };
}

/**
 * The fiscal year-end before the year containing `day`: the previous year's close. A date beyond the defined calendar follows
 * the latest known year's month and day (a 04-01 calendar closes on 31 March); with no calendar at all, 31 December.
 */
export function priorFiscalYearEnd(years, day) {
  const year = yearContaining(years, day);
  if (year) return lastCompletedYearEnd(years, year.startDate);
  const known = (years || []).map((y) => y.endDate).filter(Boolean).sort().pop();
  if (!known) return `${Number(day.slice(0, 4)) - 1}-12-31`;
  const [y0, m, d] = parts(known);
  const isLast = d === lastDay(y0, m);
  const onYear = (y) => iso(y, m, isLast ? lastDay(y, m) : d);
  const y = Number(day.slice(0, 4));
  const closing = onYear(y) >= day ? onYear(y) : onYear(y + 1);
  return onYear(Number(closing.slice(0, 4)) - 1);
}

function dateRanges(rules, day) {
  const kinds = {
    sameDateLastYear: () => minusOneYear(day),
    previousFiscalYearClose: () => priorFiscalYearEnd(rules.years, day),
  };
  const of = (mode) => {
    const resolved = kinds[rules.modes[mode]]?.();
    return resolved ? atDay(resolved) : null;
  };
  return { sly: of('sly'), prev: of('prev') };
}

/**
 * The two ranges a period is compared with: same period last year, and the previous period. In
 * Total mode the previous period is the same number of days (`previousPeriod`); in Month / Quarter
 * mode it is the previous calendar bucket, which for the range itself is `[prev(first).from, prev(last).to]`.
 * `rules` (ETP-6083, `compareRulesOf`): a report that is a balance at a date compares the bucket's end DATE instead.
 * A date with no fiscal year before it has no prior close: that comparison falls back to the period-shaped one.
 */
export function comparedRanges(period, grain, rules = null) {
  const fallback = comparedPeriodRanges(period, grain);
  if (!rules) return fallback;
  const byDate = dateRanges(rules, period.dateTo);
  return { sly: byDate.sly ?? fallback.sly, prev: byDate.prev ?? fallback.prev };
}

function comparedPeriodRanges(period, grain) {
  const sly = { from: minusOneYear(period.dateFrom), to: minusOneYear(period.dateTo) };
  if (grain === 'total') {
    const prev = previousPeriod(period);
    return { sly, prev: { from: prev.fromReferenceDate, to: prev.toReferenceDate } };
  }
  return { sly, prev: previousCalendarBucket(period, grain) };
}

const bucketOf = (idx, dateFrom, dateTo, partial, grain, rules) => ({ idx, dateFrom, dateTo, partial, ...comparedRanges({ dateFrom, dateTo }, grain, rules) });

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
export function periodBuckets({ dateFrom, dateTo }, grain, { maxShown = Infinity, rules = null } = {}) {
  const total = bucketOf(0, dateFrom, dateTo, false, grain, rules);
  const all = grain === 'total' ? [] : calendarBuckets({ dateFrom, dateTo }, grain);
  const shown = all.slice(-maxShown);
  return {
    buckets: [total, ...shown.map((b, i) => bucketOf(i + 1, b.from, b.to, b.partial, grain, rules))],
    hiddenCount: all.length - shown.length,
    total: { sly: total.sly, prev: total.prev },
  };
}

/** The request's `periods`: `from..to|slyFrom..slyTo|prevFrom..prevTo` tuples, bucket 0 first. */
export const serializePeriods = (buckets) => buckets
  .map((b) => `${b.dateFrom}..${b.dateTo}|${b.sly.from}..${b.sly.to}|${b.prev.from}..${b.prev.to}`)
  .join(',');
