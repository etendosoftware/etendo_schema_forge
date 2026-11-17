// @covers tools/app-shell/src/components/reports/dynamic/reportColumns.js
import {
  columnCount, columnModel, cellParts, COLUMN_GRAINS, exportTooLong, modeOf, rowsForMode, SCREEN_PERIODS,
} from '../reportColumns.js';
import { periodBuckets, serializePeriods } from '../dynamicDates.js';
import { buildPeriodValues, EXPORT_MAX_BUCKETS } from '@etendosoftware/schema-forge-cli/src/report-periods.js';

const range = { dateFrom: '2026-07-15', dateTo: '2026-09-30' };
const buckets = (grain, opts) => periodBuckets(range, grain, opts).buckets;
const model = (over = {}) => columnModel({
  periods: buckets('month'), grain: 'month', mode: 'none', locale: 'es_ES', quarterPrefix: 'T', totalLabel: 'TOTAL', ...over,
});

describe('reportColumns constants', () => {
  it('screen/PDF show the last 6 months or 4 quarters; exports accept 25 buckets', () => {
    expect(SCREEN_PERIODS).toEqual({ month: 6, quarter: 4 });
    expect(EXPORT_MAX_BUCKETS).toBe(25);
    expect(COLUMN_GRAINS).toEqual(['total', 'month', 'quarter']);
  });
});

describe('modeOf', () => {
  it('maps the panel comparison to the engine mode', () => {
    expect(modeOf('')).toBe('none');
    expect(modeOf('same-last-year')).toBe('sly');
    expect(modeOf('previous')).toBe('prev');
    expect(modeOf(undefined)).toBe('none');
    expect(modeOf('bogus')).toBe('none');
  });
});

describe('columnModel', () => {
  it('puts the period groups first and the range total last, each pos indexing row.cells', () => {
    const groups = model();
    // September's short form is ICU-dependent ("sep" / "sept"); the others are stable.
    expect(groups.map((g) => g.label)).toEqual([expect.stringMatching(/^jul 26\*$/), 'ago 26', expect.stringMatching(/^sept? 26$/), 'TOTAL']);
    expect(groups.map((g) => g.pos)).toEqual([1, 2, 3, 0]);
  });

  it('labels months and quarters short, es and en, with * only on partial buckets', () => {
    expect(model({ locale: 'en_US' }).map((g) => g.label)).toEqual(['Jul 26*', 'Aug 26', 'Sep 26', 'TOTAL']);
    expect(model({ periods: buckets('quarter'), grain: 'quarter' }).map((g) => g.label)).toEqual(['T3 26*', 'TOTAL']);
    expect(model({ periods: buckets('quarter'), grain: 'quarter', locale: 'en_US', quarterPrefix: 'Q' }).map((g) => g.label)).toEqual(['Q3 26*', 'TOTAL']);
    expect(model().map((g) => g.partial)).toEqual([true, false, false, false]);
  });

  it('a whole-month range has no * anywhere', () => {
    const periods = periodBuckets({ dateFrom: '2026-01-01', dateTo: '2026-03-31' }, 'month').buckets;
    expect(columnModel({ periods, grain: 'month', mode: 'none', locale: 'es_ES', totalLabel: 'T' }).some((g) => g.label.includes('*'))).toBe(false);
  });

  it('total grain is one group with the total label', () => {
    const g = model({ periods: buckets('total'), grain: 'total' });
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ pos: 0, label: 'TOTAL', current: { from: '2026-07-15', to: '2026-09-30' } });
  });

  it('without a comparison a group shows Importe only and has no compared range', () => {
    const g = model()[0];
    expect(g.columns).toEqual(['current']);
    expect(g.compared).toBeNull();
    expect(g.current).toEqual({ from: '2026-07-15', to: '2026-07-31' });
  });

  it('with a comparison a group shows Importe, Comparado and both variations, with the compared range per mode', () => {
    const sly = model({ mode: 'sly' });
    const prev = model({ mode: 'prev' });
    expect(sly[0].columns).toEqual(['current', 'compared', 'variation', 'variationPct']);
    expect(sly[0].compared).toEqual({ from: '2025-07-15', to: '2025-07-31' });
    expect(prev[0].compared).toEqual({ from: '2026-06-15', to: '2026-06-30' });
    // the total's compared range is the single D3 range
    expect(prev[prev.length - 1].compared).toEqual({ from: '2026-06-15', to: '2026-08-31' });
  });

  it('says what Comparado is compared against: the compared month / quarter, or the range for the Total', () => {
    expect(model().map((g) => g.comparedLabel)).toEqual(['', '', '', '']);
    // Same period last year: the same month, a year back. The total group names the compared dates.
    expect(model({ mode: 'sly' }).map((g) => g.comparedLabel)).toEqual(['jul 25', 'ago 25', expect.stringMatching(/^sept? 25$/), '15/07/2025 – 30/09/2025']);
    // Previous period: the previous calendar month; the total, the single D3 range.
    expect(model({ mode: 'prev' }).map((g) => g.comparedLabel)).toEqual(['jun 26', 'jul 26', 'ago 26', '15/06/2026 – 31/08/2026']);
    expect(model({ mode: 'sly', locale: 'en_US' }).map((g) => g.comparedLabel).slice(0, 2)).toEqual(['Jul 25', 'Aug 25']);
  });

  it('labels a compared quarter with the quarter prefix, and the Total mode with the compared dates', () => {
    const quarters = { periods: buckets('quarter'), grain: 'quarter' };
    expect(model({ ...quarters, mode: 'sly' })[0].comparedLabel).toBe('T3 25');
    expect(model({ ...quarters, mode: 'prev' })[0].comparedLabel).toBe('T2 26');
    expect(model({ ...quarters, mode: 'prev', locale: 'en_US', quarterPrefix: 'Q' })[0].comparedLabel).toBe('Q2 26');
    const total = model({ periods: buckets('total'), grain: 'total', mode: 'prev', locale: 'en_US' });
    // Previous period in Total mode: the same number of days (77), ending the day before the range; en-US dates, as the chip.
    expect(total[0].comparedLabel).toBe('04/28/2026 – 07/14/2026');
    expect(model({ periods: buckets('total'), grain: 'total', mode: 'sly' })[0].comparedLabel).toBe('15/07/2025 – 30/09/2025');
  });

  it('the last N buckets for screen and PDF, every bucket for export', () => {
    const wide = { dateFrom: '2025-01-01', dateTo: '2026-12-31' };
    const screen = periodBuckets(wide, 'month', { maxShown: SCREEN_PERIODS.month }).buckets;
    const all = periodBuckets(wide, 'month').buckets;
    expect(screen).toHaveLength(SCREEN_PERIODS.month + 1);
    expect(all).toHaveLength(EXPORT_MAX_BUCKETS);
    const labels = columnModel({ periods: screen, grain: 'month', mode: 'none', locale: 'en_US', totalLabel: 'TOTAL' }).map((g) => g.label);
    expect(labels).toEqual(['Jul 26', 'Aug 26', 'Sep 26', 'Oct 26', 'Nov 26', 'Dec 26', 'TOTAL']);
    expect(periodBuckets(wide, 'quarter', { maxShown: SCREEN_PERIODS.quarter }).buckets).toHaveLength(SCREEN_PERIODS.quarter + 1);
  });

  it('no periods, no groups; the locale defaults to en_US', () => {
    expect(columnModel({ periods: undefined, grain: 'month', mode: 'none' })).toEqual([]);
    expect(columnModel({ periods: buckets('month'), grain: 'month', mode: 'none', totalLabel: 'T' })[1].label).toBe('Aug 26');
  });
});

describe('columnCount', () => {
  it('sums the sub-columns of every group', () => {
    expect(columnCount(model())).toBe(4);
    expect(columnCount(model({ mode: 'sly' }))).toBe(16);
    expect(columnCount([])).toBe(0);
  });
});

const cell = (amount, ref) => ({ amount, sly: { amount: ref, variationAmount: amount - ref, variationPct: 10, trend: 'up' }, prev: { amount: ref + 1, variationAmount: 1, variationPct: 5, trend: 'down' } });

describe('cellParts', () => {
  const row = { cells: [cell(100, 80), cell(40, 30)] };

  it('reads the cell at pos for the mode', () => {
    expect(cellParts(row, 1, 'sly')).toEqual({ amount: 40, compared: 30, variationAmount: 10, variationPct: 10, trend: 'up' });
    expect(cellParts(row, 0, 'prev')).toMatchObject({ amount: 100, compared: 81, trend: 'down' });
  });

  it('mode none has no comparison', () => {
    expect(cellParts(row, 0, 'none')).toEqual({ amount: 100, compared: 0, variationAmount: undefined, variationPct: undefined, trend: undefined });
  });

  it('a missing cell is zero', () => {
    expect(cellParts(row, 5, 'sly').amount).toBe(0);
    expect(cellParts(row, 5, 'sly').compared).toBe(0);
  });

  it('a legacy row without cells reads as a single cell', () => {
    const legacy = { amount: 7, amount_ref: 5, variationAmount: 2, variationPct: 40, trend: 'up' };
    expect(cellParts(legacy, 0, 'prev')).toEqual({ amount: 7, compared: 5, variationAmount: 2, variationPct: 40, trend: 'up' });
    expect(cellParts(legacy, 1, 'prev').amount).toBe(0);
  });
});

describe('rowsForMode', () => {
  const rows = [
    { node_id: 'A', visible: { none: true, sly: true, prev: false }, parentIds: { none: null, sly: null, prev: null }, cells: [cell(10, 4)] },
    { node_id: 'B', visible: { none: false, sly: true, prev: true }, parentIds: { none: 'A', sly: 'A', prev: 'A' }, cells: [cell(6, 2)] },
    { node_id: 'C', visible: { none: true, sly: false, prev: true }, parentIds: { none: 'A', sly: 'B', prev: 'B' }, cells: [cell(3, 1)] },
  ];

  it('keeps the rows visible in the mode and re-parents them per mode', () => {
    expect(rowsForMode(rows, 'none').map((r) => [r.node_id, r.parentId])).toEqual([['A', null], ['C', 'A']]);
    expect(rowsForMode(rows, 'sly').map((r) => [r.node_id, r.parentId])).toEqual([['A', null], ['B', 'A']]);
    expect(rowsForMode(rows, 'prev').map((r) => [r.node_id, r.parentId])).toEqual([['B', 'A'], ['C', 'B']]);
  });

  it('reads the top-level amount, reference and variation from the mode cells[0]', () => {
    const [a] = rowsForMode(rows, 'sly');
    expect(a).toMatchObject({ amount: 10, amount_ref: 4, variationAmount: 6, variationPct: 10, trend: 'up' });
    expect(rowsForMode(rows, 'none')[0].amount_ref).toBe(0);
  });

  it('a row without visible/parentIds is shown with its own parentId', () => {
    const [r] = rowsForMode([{ node_id: 'X', parentId: 'P', amount: 3 }], 'prev');
    expect(r).toMatchObject({ node_id: 'X', parentId: 'P', amount: 3 });
    expect(r.cells).toHaveLength(1);
  });

  it('no rows is an empty list', () => {
    expect(rowsForMode(undefined, 'none')).toEqual([]);
  });
});

describe('exportTooLong (the server validator itself)', () => {
  const tooLong = (r, grain) => exportTooLong(periodBuckets(r, grain), grain);
  it('refuses a range past from + 24 months, accepts exactly 24, refuses over 25 buckets', () => {
    expect(tooLong({ dateFrom: '2024-01-01', dateTo: '2026-12-31' }, 'total')).toBe(true);
    expect(tooLong({ dateFrom: '2025-03-01', dateTo: '2027-03-01' }, 'total')).toBe(false);
    expect(tooLong({ dateFrom: '2024-01-01', dateTo: '2025-12-31' }, 'month')).toBe(false);
    expect(tooLong({ dateFrom: '2023-01-01', dateTo: '2025-12-31' }, 'month')).toBe(true);
  });
  it('is false without a plan', () => {
    expect(exportTooLong(null, 'total')).toBe(false);
  });
  // Alex W1 fixtures: the client used to enable the button and the server answered 400.
  it.each([
    ['total over a 29 Feb', { dateFrom: '2019-01-01', dateTo: '2021-01-01' }, 'total'],
    ['quarter ending 28 Feb after a leap year', { dateFrom: '2019-02-28', dateTo: '2021-02-28' }, 'quarter'],
  ])('matches the server on %s', (_n, r, grain) => {
    const plan = periodBuckets(r, grain);
    let server = false;
    try { buildPeriodValues(serializePeriods(plan.buckets), { maxBuckets: EXPORT_MAX_BUCKETS, capRange: true, grain, hiddenCount: plan.hiddenCount }); } catch (e) { server = e.code === 'PERIOD_RANGE_TOO_LONG'; }
    expect(server).toBe(true);
    expect(exportTooLong(plan, grain)).toBe(true);
  });
});
