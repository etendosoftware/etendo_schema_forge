// @covers tools/app-shell/src/components/reports/dynamic/reportVisuals.js
import { kpiTrend, reportKpis, rowShares, splitShares } from '../reportVisuals.js';

// Two income lines, one expense line with a child, and a formula subtotal that must not count twice.
const ROWS = [
  { node_id: 'R', parentId: null, amount: 1000, amount_ref: 800 },
  { node_id: 'R2', parentId: null, amount: 200, amount_ref: 0 },
  { node_id: 'X', parentId: null, amount: -400, amount_ref: -500 },
  { node_id: 'X1', parentId: 'X', amount: -100, amount_ref: -50 },
  { node_id: 'A', parentId: null, amount: 800, amount_ref: 300, isFormula: true },
];

describe('reportKpis', () => {
  it('splits the top-level lines into income and expenses, skipping children and formulas', () => {
    const { current, ref } = reportKpis(ROWS);
    expect(current).toEqual({ income: 1200, expenses: 400, result: 800, margin: (800 / 1200) * 100 });
    expect(ref).toEqual({ income: 800, expenses: 500, result: 300, margin: 37.5 });
  });

  it('has no margin without income, and reads a missing amount as zero', () => {
    expect(reportKpis([{ node_id: 'X', amount: -10 }]).current).toEqual({ income: 0, expenses: 10, result: -10, margin: null });
    expect(reportKpis([]).ref.margin).toBeNull();
  });

  it('treats a row whose parent is not listed as top-level', () => {
    expect(reportKpis([{ node_id: 'C', parentId: 'gone', amount: 50 }]).current.income).toBe(50);
  });
});

describe('reportKpis by account group', () => {
  // As the real P&L: headings P.G.x, accounts under them, subaccounts under those.
  const PGC = [
    { node_id: 'PG1', parentId: null, value: 'P.G.1', amount: 17248, amount_ref: 100 },
    { node_id: '700', parentId: 'PG1', value: '700', amount: 17248, amount_ref: 100 },
    { node_id: '7000', parentId: '700', value: '7000', amount: 17248, amount_ref: 100 },
    { node_id: 'PG4', parentId: null, value: 'P.G.4', amount: -4499, amount_ref: -50 },
    { node_id: '600', parentId: 'PG4', value: '600', amount: -4499, amount_ref: -50 },
    // An expense line in credit this period (a refund): it lowers expenses, it is not income.
    { node_id: 'PG7', parentId: null, value: 'P.G.7', amount: 10, amount_ref: -20 },
    { node_id: '623', parentId: 'PG7', value: '623', amount: 10, amount_ref: -20 },
    // A line with both groups: each account goes to its own side.
    { node_id: 'PG12', parentId: null, value: 'P.G.12', amount: 5, amount_ref: 0 },
    { node_id: '678', parentId: 'PG12', value: '678', amount: -15, amount_ref: 0 },
    { node_id: '778', parentId: 'PG12', value: '778', amount: 20, amount_ref: 0 },
    // A line with no accounts listed goes by its sign.
    { node_id: 'PG2', parentId: null, value: 'P.G.2', amount: 7, amount_ref: 0 },
    { node_id: 'PGA', parentId: null, value: 'P.G.A', amount: 12759, amount_ref: 30, isFormula: true },
  ];

  it('counts the first account level by group 7 / 6, never a subaccount twice', () => {
    const { current, ref } = reportKpis(PGC);
    expect(current.income).toBe(17248 + 20 + 7);
    expect(current.expenses).toBe(4499 - 10 + 15);
    expect(current.result).toBe(17248 - 4499 + 10 + 5 + 7);
    expect(ref).toMatchObject({ income: 100, expenses: 70, result: 30 });
  });
});

describe('kpiTrend', () => {
  it('reads growth as good news except for expenses', () => {
    expect(kpiTrend('income', 2, 1)).toBe('improves');
    expect(kpiTrend('result', 1, 2)).toBe('worsens');
    expect(kpiTrend('expenses', 2, 1)).toBe('worsens');
    expect(kpiTrend('expenses', 1, 2)).toBe('improves');
  });

  it('has no trend without a change or a value', () => {
    expect(kpiTrend('income', 1, 1)).toBeNull();
    expect(kpiTrend('margin', null, 1)).toBeNull();
    expect(kpiTrend('margin', 1, null)).toBeNull();
  });
});

describe('rowShares', () => {
  it('weighs a child within its parent and a top line within the largest top line', () => {
    const s = rowShares(ROWS);
    expect(s.get('R')).toBe(1);
    expect(s.get('R2')).toBe(0.2);
    expect(s.get('X')).toBe(0.4);
    expect(s.get('X1')).toBe(0.25);
  });

  it('gives no bar to formulas and zero amounts', () => {
    const s = rowShares([...ROWS, { node_id: 'Z', parentId: null, amount: 0 }]);
    expect(s.has('A')).toBe(false);
    expect(s.has('Z')).toBe(false);
  });
});

describe('splitShares', () => {
  it('weighs each part within the parts total, by magnitude', () => {
    expect(splitShares([{ amount: 30 }, { amount: -10 }])).toEqual([0.75, 0.25]);
    expect(splitShares([{ amount: 0 }])).toEqual([0]);
  });
});
