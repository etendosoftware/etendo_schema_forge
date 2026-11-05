/** @covers tools/app-shell/src/windows/custom/product/stockChartAxis.js */
import { describe, it, expect } from 'vitest';
import { shortMonthName, formatFullDate, buildXAxisLabels, buildTooltipModel } from '../stockChartAxis';

import { dayNumber } from '../stockSeries';

const day = (y, m, d) => dayNumber(new Date(y, m - 1, d));
const range = (a, b) => ({ startDay: day(...a), endDay: day(...b) });
// 12M window on 3 Nov 2026 and 3M window on 3 Nov 2026.
const R12 = range([2025, 11, 3], [2026, 11, 3]);
const R3 = range([2026, 8, 3], [2026, 11, 3]);

describe('shortMonthName', () => {
  it('uses the system language, capitalised, without trailing dot', () => {
    expect(shortMonthName(0, 'es_ES')).toBe('Ene');
    expect(shortMonthName(3, 'es_AR')).toBe('Abr');
    expect(shortMonthName(7, 'es_ES')).toBe('Ago');
    expect(shortMonthName(0, 'en_US')).toBe('Jan');
    expect(shortMonthName(3, 'en_US')).toBe('Apr');
    expect(shortMonthName(7, 'en_US')).toBe('Aug');
  });
});

describe('formatFullDate', () => {
  it('renders "D Mon YYYY" in the system language', () => {
    expect(formatFullDate(day(2026, 10, 28), 'es_ES')).toBe('28 Oct 2026');
    expect(formatFullDate(day(2026, 1, 5), 'es_ES')).toBe('5 Ene 2026');
    expect(formatFullDate(day(2026, 1, 5), 'en_US')).toBe('5 Jan 2026');
  });
});

describe('buildXAxisLabels', () => {
  it('12 months: every 2 months, year only on the first label and on the year change, at the 1st of the month', () => {
    const labels = buildXAxisLabels(R12, 'es_ES');
    expect(labels.map(l => l.text)).toEqual(['Nov', 'Ene', 'Mar', 'May', 'Jul', 'Sep', 'Nov']);
    expect(labels.map(l => l.year)).toEqual(['2025', '2026', null, null, null, null, null]);
    expect(labels[0].day).toBe(R12.startDay);
    expect(labels[1].day).toBe(day(2026, 1, 1));
    expect(labels.map(l => l.anchor)).toEqual(['start', 'middle', 'middle', 'middle', 'middle', 'middle', 'end']);
  });

  it('3 months: one label per month, first at the window start, last anchored inward', () => {
    const labels = buildXAxisLabels(R3, 'es_ES');
    expect(labels.map(l => l.text)).toEqual(['Ago', 'Sep', 'Oct', 'Nov']);
    expect(labels.map(l => l.year)).toEqual(['2026', null, null, null]);
    expect(labels[0].anchor).toBe('start');
    expect(labels[3].anchor).toBe('end');
  });

  it('6 months: one label per month and a year change shows the new year', () => {
    const labels = buildXAxisLabels(range([2025, 11, 1], [2026, 4, 30]), 'en_US');
    expect(labels.map(l => l.text)).toEqual(['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr']);
    expect(labels.map(l => l.year)).toEqual(['2025', null, '2026', null, null, null]);
  });

  it('keeps a mid-window last label centred when today is far from the 1st', () => {
    const labels = buildXAxisLabels(range([2026, 8, 3], [2026, 11, 28]), 'es_ES');
    expect(labels[labels.length - 1].anchor).toBe('middle');
  });

  it('drops the first label when the next month starts right after the window start', () => {
    const labels = buildXAxisLabels(range([2026, 8, 29], [2026, 11, 29]), 'es_ES');
    expect(labels.map(l => l.text)).toEqual(['Sep', 'Oct', 'Nov']);
    expect(labels[0].year).toBe('2026');
  });
});

describe('buildTooltipModel', () => {
  const series = [
    { name: 'Small', color: '#a', points: [{ day: day(2026, 5, 1), value: 1 }, { day: day(2026, 6, 10), value: 5 }] },
    { name: 'Big', color: '#b', points: [{ day: day(2026, 5, 1), value: 2 }, { day: day(2026, 6, 10), value: 1080 }] },
  ];
  const opts = { day: day(2026, 6, 12), locale: 'es_ES', totalLabel: 'Total', unitLabel: 'u' };

  it('uses the full date and the balance on that day, sorted, with a Total row for several warehouses', () => {
    const m = buildTooltipModel({ ...opts, series });
    expect(m.title).toBe('12 Jun 2026');
    expect(m.rows.map(r => [r.name, r.valueText])).toEqual([['Big', '1.080 u'], ['Small', '5 u']]);
    expect(m.total).toEqual({ label: 'Total', valueText: '1.085 u' });
  });

  it('uses the last known point at or before the day', () => {
    const m = buildTooltipModel({ ...opts, day: day(2026, 6, 9), series });
    expect(m.rows.map(r => r.valueText)).toEqual(['2 u', '1 u']);
  });

  it('omits the Total row when a single warehouse is visible', () => {
    const m = buildTooltipModel({ ...opts, series: [series[1]] });
    expect(m.rows).toHaveLength(1);
    expect(m.total).toBeNull();
  });

  it('labels an unnamed (aggregated) series with the total label', () => {
    const m = buildTooltipModel({ ...opts, series: [{ name: null, color: '#c', points: [{ day: day(2026, 6, 1), value: 20 }] }] });
    expect(m.rows[0].name).toBe('Total');
    expect(m.total).toBeNull();
  });
});
