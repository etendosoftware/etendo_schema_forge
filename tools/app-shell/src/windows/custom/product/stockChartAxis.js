import { formatCalendarDate } from '@/lib/dateOnly';
import { formatStockQuantity } from './stockQuantityFormat';
import { dateFromDay, dayNumber, dayFraction, valueAtDay } from './stockSeries';

// Pure helpers for the product side-panel / modal stock chart (ETP-5908 RF-10..RF-12).

const toIntlLocale = (appLocale) => (appLocale || 'es_ES').replace('_', '-');

/**
 * Abbreviated month name (0-based index) in the app language: first letter uppercase, no trailing
 * dot (es: Ene, Abr, Ago; en: Jan, Apr, Aug). Same pattern as date-range-popover.jsx.
 */
export function shortMonthName(monthIndex, appLocale) {
  const raw = formatCalendarDate(new Date(2024, monthIndex, 1), toIntlLocale(appLocale), { month: 'short' })
    .replace(/\.$/, '')
    // ICU gives "sept" for es: cap at 3 letters so every month is Ene..Dic / Jan..Dec as in the design.
    .slice(0, 3);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const AXIS_MAX_STEPS = 6;
// A label closer than this share of the window to the previous kept one would overlap it.
const MIN_LABEL_GAP = 0.08;
// A label this close to the right edge is anchored inward so it is never cut.
const END_ZONE = 0.04;

/** "28 Oct 2026": full date title of the tooltip (system-language short month, capitalised, no dot). */
export function formatFullDate(day, appLocale) {
  const d = dateFromDay(day);
  return `${d.getDate()} ${shortMonthName(d.getMonth(), appLocale)} ${d.getFullYear()}`;
}

// 1st of every month of the window (the first label sits at the window start itself).
function monthStarts(range) {
  const start = dateFromDay(range.startDay);
  const end = dateFromDay(range.endDay);
  const months = [{ day: range.startDay, year: start.getFullYear(), monthIndex: start.getMonth() }];
  for (let d = new Date(start.getFullYear(), start.getMonth() + 1, 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push({ day: dayNumber(d), year: d.getFullYear(), monthIndex: d.getMonth() });
  }
  return months;
}

function labelAnchor(isFirst, day, range) {
  if (isFirst) return 'start';
  return dayFraction(day, range) > 1 - END_ZONE ? 'end' : 'middle';
}

/**
 * X-axis labels on the date scale (`range` = { startDay, endDay }). One label per month up to 6 months,
 * every 2 months for 12 or 13 (ceil((n - 1) / 6) in general); each sits at the 1st of its month and
 * the first one at the window start. `year` is set only on the first label and wherever the year
 * changes. When the second label would overlap the first (window starting late in a month) the first
 * is dropped. First / last-edge labels are anchored inward; the rest are centred.
 * @returns {{day:number, text:string, year:string|null, anchor:'start'|'middle'|'end'}[]}
 */
export function buildXAxisLabels(range, appLocale) {
  const months = monthStarts(range);
  const step = Math.max(1, Math.ceil((months.length - 1) / AXIS_MAX_STEPS));
  let picked = months.filter((_, i) => i % step === 0);
  if (picked.length > 1 && dayFraction(picked[1].day, range) < MIN_LABEL_GAP) picked = picked.slice(1);
  let lastYear = null;
  return picked.map((m, i) => {
    const year = String(m.year);
    const label = {
      day: m.day,
      text: shortMonthName(m.monthIndex, appLocale),
      year: year === lastYear ? null : year,
      anchor: labelAnchor(i === 0, m.day, range),
    };
    lastYear = year;
    return label;
  });
}

/**
 * Tooltip content for the hovered day: full-date title, one row per visible series (balance on that
 * day) sorted from largest to smallest, and a Total row only when more than one series is visible.
 */
export function buildTooltipModel({ series, day, locale, totalLabel, unitLabel }) {
  const withUnit = (v) => `${formatStockQuantity(v)} ${unitLabel}`;
  const rows = series
    .map(s => ({ name: s.name ?? totalLabel, color: s.color, value: valueAtDay(s.points, day) }))
    .sort((a, b) => b.value - a.value)
    .map(r => ({ name: r.name, color: r.color, valueText: withUnit(r.value) }));
  const sum = series.reduce((acc, s) => acc + valueAtDay(s.points, day), 0);
  return {
    title: formatFullDate(day, locale),
    rows,
    total: series.length > 1 ? { label: totalLabel, valueText: withUnit(sum) } : null,
  };
}
