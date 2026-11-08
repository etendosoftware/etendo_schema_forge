/** @covers tools/app-shell/src/windows/custom/product/stockSeries.js */
import { describe, it, expect } from 'vitest';
import {
  dayNumber, dateFromDay, periodDayRange, buildDailyPoints, valueAtDay, dayFraction, fractionToDay,
  toMovements, buildChartModel,
} from '../stockSeries';

const d = (y, m, day) => dayNumber(new Date(y, m - 1, day));
const START = d(2026, 1, 1);
const END = d(2026, 1, 31);
const mv = (day, qty) => ({ day: d(2026, 1, day), qty });
const range = { startDay: START, endDay: END };

describe('dayNumber / dateFromDay', () => {
  it('round-trips a calendar day', () => {
    expect(dateFromDay(d(2026, 10, 28))).toEqual(new Date(2026, 9, 28));
    expect(d(2026, 1, 2) - d(2026, 1, 1)).toBe(1);
  });
});

describe('periodDayRange', () => {
  it('starts today minus N months and ends today', () => {
    const r = periodDayRange(12, new Date(2026, 10, 3));
    expect(dateFromDay(r.startDay)).toEqual(new Date(2025, 10, 3));
    expect(dateFromDay(r.endDay)).toEqual(new Date(2026, 10, 3));
  });
});

describe('buildDailyPoints', () => {
  it('is flat at the current stock when nothing moved in the window', () => {
    const pts = buildDailyPoints({ movements: [], anchor: 7, ...range });
    expect(pts).toEqual([{ day: START, value: 7 }, { day: END, value: 7 }]);
  });

  it('computes balances from a hand-worked example anchored to the current stock', () => {
    // anchor 10; +5 on the 10th, -2 on the 20th => before 5th: 7, after 10th: 12, after 20th: 10
    const pts = buildDailyPoints({ movements: [mv(20, -2), mv(10, 5)], anchor: 10, ...range });
    expect(pts.map(p => [p.day - START + 1, p.value])).toEqual([
      [1, 7], [9, 7], [10, 12], [19, 12], [20, 10], [31, 10],
    ]);
  });

  it('sums several movements of the same day and keeps one point for it', () => {
    const pts = buildDailyPoints({ movements: [mv(5, 3), mv(5, 4), mv(5, -1)], anchor: 6, ...range });
    expect(pts.filter(p => p.day === d(2026, 1, 5))).toEqual([{ day: d(2026, 1, 5), value: 6 }]);
    expect(valueAtDay(pts, d(2026, 1, 4))).toBe(0);
  });

  it('merges a movement exactly on the start date and one exactly on today into those points', () => {
    const pts = buildDailyPoints({ movements: [mv(1, 2), mv(31, 3)], anchor: 5, ...range });
    expect(pts[0]).toEqual({ day: START, value: 2 });
    expect(pts[pts.length - 1]).toEqual({ day: END, value: 5 });
    expect(pts.filter(p => p.day === START)).toHaveLength(1);
    expect(pts.filter(p => p.day === END)).toHaveLength(1);
    expect(valueAtDay(pts, d(2026, 1, 30))).toBe(2);
  });

  it('accepts unsorted input', () => {
    const a = buildDailyPoints({ movements: [mv(20, -2), mv(3, 1), mv(10, 5)], anchor: 4, ...range });
    const b = buildDailyPoints({ movements: [mv(3, 1), mv(10, 5), mv(20, -2)], anchor: 4, ...range });
    expect(a).toEqual(b);
  });

  it('ignores movements outside the window (they only matter through the anchor)', () => {
    const pts = buildDailyPoints({ movements: [{ day: START - 5, qty: 100 }, { day: END + 3, qty: 9 }], anchor: 4, ...range });
    expect(pts).toEqual([{ day: START, value: 4 }, { day: END, value: 4 }]);
  });

  it('adds a hold point the day before a change carrying the previous balance', () => {
    const pts = buildDailyPoints({ movements: [mv(10, 5)], anchor: 5, ...range });
    expect(pts).toContainEqual({ day: d(2026, 1, 9), value: 0 });
    expect(pts).toContainEqual({ day: d(2026, 1, 10), value: 5 });
    // consecutive days need no hold point
    const adj = buildDailyPoints({ movements: [mv(2, 1)], anchor: 1, ...range });
    expect(adj.slice(0, 2)).toEqual([{ day: START, value: 0 }, { day: d(2026, 1, 2), value: 1 }]);
  });

  it('keeps negative balances as they are', () => {
    const pts = buildDailyPoints({ movements: [mv(5, -3)], anchor: 0, ...range });
    expect(valueAtDay(pts, d(2026, 1, 5))).toBe(0);
    expect(valueAtDay(pts, d(2026, 1, 4))).toBe(3);
    const neg = buildDailyPoints({ movements: [mv(5, 3)], anchor: 0, ...range });
    expect(valueAtDay(neg, d(2026, 1, 4))).toBe(-3);
  });

  it('ends at the sum of the window when there is no anchor', () => {
    const pts = buildDailyPoints({ movements: [mv(5, 3), mv(9, 2)], anchor: null, ...range });
    expect(pts[0].value).toBe(0);
    expect(pts[pts.length - 1].value).toBe(5);
  });

  it('521 balanced +1/-1 pairs ending at 12.5 keep the balance in 0..1 before the last movement', () => {
    const big = { startDay: 0, endDay: 700 };
    const movements = [];
    for (let i = 0; i < 260; i++) movements.push({ day: 10 + i, qty: i % 2 === 0 ? 1 : -1 });
    movements.push({ day: 400, qty: 12.5 });
    const pts = buildDailyPoints({ movements, anchor: 12.5, ...big });
    const before = pts.filter(p => p.day < 400);
    expect(before.length).toBeGreaterThan(200);
    for (const p of before) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(1);
    }
    expect(valueAtDay(pts, 700)).toBe(12.5);
  });
});

describe('valueAtDay / fractions', () => {
  const pts = [{ day: 0, value: 1 }, { day: 10, value: 4 }];
  it('returns the last point at or before the day', () => {
    expect(valueAtDay(pts, 5)).toBe(1);
    expect(valueAtDay(pts, 10)).toBe(4);
    expect(valueAtDay(pts, 99)).toBe(4);
  });
  it('maps days to the date scale and back, clamped', () => {
    const r = { startDay: 100, endDay: 200 };
    expect(dayFraction(150, r)).toBe(0.5);
    expect(fractionToDay(0.5, r)).toBe(150);
    expect(fractionToDay(-1, r)).toBe(100);
    expect(fractionToDay(2, r)).toBe(200);
    expect(dayFraction(5, { startDay: 5, endDay: 5 })).toBe(0);
  });
});

describe('toMovements', () => {
  it('reads day strings without a timezone shift and drops invalid dates', () => {
    const out = toMovements([{ movementDate: '2026-10-28', movementQuantity: '2' }, { movementDate: null, movementQuantity: 1 }]);
    expect(out).toEqual([{ day: d(2026, 10, 28), qty: 2 }]);
  });
});

describe('buildChartModel', () => {
  const today = new Date(2026, 10, 3);
  const colors = ['#a', '#b'];
  const tx = [
    { movementDate: '2026-10-28', movementQuantity: 4, storageBin: 'L1' },
    { movementDate: '2026-10-29', movementQuantity: 1, storageBin: 'L2' },
    { movementDate: '2026-10-29', movementQuantity: 9, storageBin: 'UNKNOWN' },
  ];
  const warehouses = [{ binName: 'WH-A', quantityOnHand: 4 }, { binName: 'WH-B', quantityOnHand: 1 }];

  it('builds one series per warehouse on a shared window, ignoring unmapped locators', () => {
    const m = buildChartModel({ transactions: tx, currentStock: 5, warehouses, locatorToWarehouse: { L1: 'WH-A', L2: 'WH-B' }, months: 12, today, colors });
    expect(m.series.map(s => [s.name, s.color])).toEqual([['WH-A', '#a'], ['WH-B', '#b']]);
    expect(valueAtDay(m.series[0].points, d(2026, 10, 27))).toBe(0);
    expect(valueAtDay(m.series[0].points, d(2026, 10, 28))).toBe(4);
    expect(valueAtDay(m.series[1].points, m.range.endDay)).toBe(1);
  });

  it('falls back to one aggregated line without warehouses and is null when everything is 0', () => {
    const m = buildChartModel({ transactions: tx, currentStock: 14, warehouses: [], months: 3, today, colors });
    expect(m.series).toHaveLength(1);
    expect(m.series[0].name).toBeNull();
    expect(buildChartModel({ transactions: [], currentStock: 0, warehouses: [], months: 3, today, colors })).toBeNull();
  });
});
