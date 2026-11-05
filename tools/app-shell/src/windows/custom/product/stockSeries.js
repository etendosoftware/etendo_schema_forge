import { parseCalendarDate } from '@/lib/dateOnly';
import { computePeriodRange } from './productSidebarPeriod';

// Pure series math of the product side-panel / modal stock chart (ETP-5908). A series is a list of
// points { day, value } positioned on a DATE scale: `day` is a calendar-day number (days since the
// epoch, timezone-free), so a movement can never slip to the neighbouring day.

const MS_DAY = 86400000;
const SINGLE_COLOR = 'var(--status-info-fg)';

/** Calendar-day number of a Date (local Y/M/D components, so DST and the UTC offset never shift it). */
export const dayNumber = (date) => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_DAY);

/** Local-midnight Date of a calendar-day number (inverse of dayNumber). */
export function dateFromDay(day) {
  const u = new Date(day * MS_DAY);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
}

/** Window of a period as day numbers: start = today minus N months, end = today. */
export function periodDayRange(months, today) {
  const { start, end } = computePeriodRange(months, today);
  return { startDay: dayNumber(start), endDay: dayNumber(end) };
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

function dailyDeltas(movements, startDay, endDay) {
  const delta = new Map();
  for (const { day, qty } of movements) {
    if (day < startDay || day > endDay || !Number.isFinite(qty)) continue;
    delta.set(day, (delta.get(day) || 0) + qty);
  }
  return delta;
}

// Adds, before each change, a point on the previous day carrying the previous balance, so a smooth
// curve keeps the plateau flat instead of sloping between two far-apart days.
function withHoldPoints(points) {
  const out = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (prev && p.day - 1 > prev.day && p.value !== prev.value) out.push({ day: p.day - 1, value: prev.value });
    out.push(p);
  }
  return out;
}

/**
 * Daily points of one series. `movements` = [{ day, qty }] (any order). The balance at the END of a
 * day is `anchor` (current stock) minus the movements strictly after it; movements before the window
 * only matter through the anchor, movements after `endDay` are ignored. Without an anchor the series
 * ends at the sum of the window's movements. Points: window start, every day with a movement, end,
 * plus hold points.
 * @returns {{day:number, value:number}[]}
 */
export function buildDailyPoints({ movements, anchor, startDay, endDay }) {
  const delta = dailyDeltas(movements, startDay, endDay);
  let total = 0;
  for (const q of delta.values()) total += q;
  const end = anchor == null ? total : Number(anchor);
  const days = [...new Set([startDay, endDay, ...delta.keys()])].sort((a, b) => a - b);
  let upTo = 0;
  const points = days.map((day) => {
    upTo += delta.get(day) || 0;
    return { day, value: round6(end - (total - upTo)) };
  });
  return withHoldPoints(points);
}

/** Balance on `day`: the last known point at or before it (the first point when the day precedes all). */
export function valueAtDay(points, day) {
  let value = points[0]?.value ?? 0;
  for (const p of points) {
    if (p.day > day) break;
    value = p.value;
  }
  return value;
}

/** Position of a day on the date scale, 0 (window start) .. 1 (today). */
export const dayFraction = (day, { startDay, endDay }) => (endDay > startDay ? (day - startDay) / (endDay - startDay) : 0);

/** Nearest calendar day of a 0..1 position on the date scale. */
export const fractionToDay = (fraction, { startDay, endDay }) => {
  const clamped = Math.max(0, Math.min(1, fraction));
  return startDay + Math.round(clamped * (endDay - startDay));
};

/** Movement rows ({ movementDate, movementQuantity }) -> [{ day, qty }]; rows with no valid date are dropped. */
export function toMovements(transactions, keep = () => true) {
  const out = [];
  for (const t of transactions ?? []) {
    if (!keep(t)) continue;
    const d = parseCalendarDate(t.movementDate);
    if (d) out.push({ day: dayNumber(d), qty: Number(t.movementQuantity || 0) });
  }
  return out;
}

/**
 * Chart model of a period: the shared window plus one series per warehouse (colour = legend order),
 * or a single aggregated line when there are no warehouses. A warehouse is matched through
 * `locatorToWarehouse`; movements of an unknown locator are ignored. Returns null when there is
 * nothing to draw (no history and no stock, or the whole aggregated line sits at 0).
 * @returns {{range:{startDay:number,endDay:number}, series:{name:string|null,color:string,points:object[]}[]}|null}
 */
export function buildChartModel({ transactions, currentStock, warehouses = [], locatorToWarehouse = {}, months, today, colors }) {
  const range = periodDayRange(months, today);
  const totalPoints = buildDailyPoints({ movements: toMovements(transactions), anchor: currentStock, ...range });
  if (totalPoints.every((p) => p.value === 0)) return null;
  if (warehouses.length === 0) return { range, series: [{ name: null, color: SINGLE_COLOR, points: totalPoints }] };
  const series = warehouses.map((w, i) => ({
    name: w.binName,
    color: colors[i % colors.length],
    points: buildDailyPoints({
      movements: toMovements(transactions, (t) => locatorToWarehouse[t.storageBin] === w.binName),
      anchor: w.quantityOnHand,
      ...range,
    }),
  }));
  return { range, series };
}
