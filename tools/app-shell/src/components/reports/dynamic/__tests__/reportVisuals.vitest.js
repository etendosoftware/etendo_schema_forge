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
