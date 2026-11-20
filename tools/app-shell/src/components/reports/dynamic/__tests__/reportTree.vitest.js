// @covers tools/app-shell/src/components/reports/dynamic/reportTree.js
import { canSplit, expandAll, expandedNodeIdsParam, expansionForLevel, foldExpansion, levelHiddenIds, parentIds, visibleRows } from '../reportTree.js';

// A heading with an account, which has a breakdown with a subaccount; a formula total at the top.
const ROWS = [
  { node_id: 'E1', parentId: null, elementlevel: 'E' },
  { node_id: 'C1', parentId: 'E1', elementlevel: 'C' },
  { node_id: 'D1', parentId: 'C1', elementlevel: 'D' },
  { node_id: 'S1', parentId: 'D1', elementlevel: 'S' },
  { node_id: 'C2', parentId: 'E1', elementlevel: 'C' },
  { node_id: 'T', parentId: null, elementlevel: 'E', isFormula: true },
];
const ids = (rows) => rows.map((r) => r.node_id);

describe('reportTree', () => {
  it('expandedNodeIdsParam joins the open rows and says "none" when nothing is open', () => {
    expect(expandedNodeIdsParam(new Set(['E1', 'C1']))).toBe('E1,C1');
    expect(expandedNodeIdsParam(new Set())).toBe('none');
  });

  it('parentIds lists the rows that have children', () => {
    expect([...parentIds(ROWS)].sort()).toEqual(['C1', 'D1', 'E1']);
  });

  it('a level expands every parent above it', () => {
    expect(ids(visibleRows(ROWS, expansionForLevel(ROWS, 'E')))).toEqual(['E1', 'T']);
    expect(ids(visibleRows(ROWS, expansionForLevel(ROWS, 'C')))).toEqual(['E1', 'C1', 'C2', 'T']);
    expect(ids(visibleRows(ROWS, expansionForLevel(ROWS, 'S')))).toEqual(['E1', 'C1', 'D1', 'S1', 'C2', 'T']);
  });

  it('an unknown level expands, so its children are never hidden by it', () => {
    const rows = [{ node_id: 'X', parentId: null, elementlevel: '' }, { node_id: 'Y', parentId: 'X', elementlevel: 'C' }];
    expect(ids(visibleRows(rows, expansionForLevel(rows, 'E')))).toEqual(['X', 'Y']);
  });

  it('a collapsed row hides its whole subtree, even with expanded descendants', () => {
    const expanded = new Set(['C1', 'D1']); // E1 collapsed
    expect(ids(visibleRows(ROWS, expanded))).toEqual(['E1', 'T']);
  });

  it('marks depth and children', () => {
    const shown = visibleRows(ROWS, expandAll(ROWS));
    expect(shown.map((r) => [r.node_id, r.depth, r.hasChildren])).toEqual([
      ['E1', 0, true], ['C1', 1, true], ['D1', 2, true], ['S1', 3, false], ['C2', 1, false], ['T', 0, false],
    ]);
  });

  it('only a leaf, non-formula row can be split', () => {
    const shown = visibleRows(ROWS, expandAll(ROWS));
    expect(shown.filter(canSplit).map((r) => r.node_id)).toEqual(['S1', 'C2']);
  });

  it('a fold is its base plus the rows the user flipped; a flipped leaf is ignored', () => {
    const none = new Set();
    expect([...foldExpansion(ROWS, { base: 'level', flipped: none }, 'C')]).toEqual(['E1']);
    expect([...foldExpansion(ROWS, { base: 'all', flipped: none }, 'C')].sort()).toEqual(['C1', 'D1', 'E1']);
    expect([...foldExpansion(ROWS, { base: 'none', flipped: none }, 'C')]).toEqual([]);
    expect([...foldExpansion(ROWS, { base: 'level', flipped: new Set(['E1', 'C1', 'S1']) }, 'C')]).toEqual(['C1']);
  });

  it('rows that first appear later follow the base, not the old expansion', () => {
    const fold = { base: 'level', flipped: new Set(['C1']) };
    const more = [...ROWS, { node_id: 'E2', parentId: null, elementlevel: 'E' }, { node_id: 'C3', parentId: 'E2', elementlevel: 'C' }];
    expect(ids(visibleRows(more, foldExpansion(more, fold, 'C')))).toEqual(['E1', 'C1', 'D1', 'C2', 'T', 'E2', 'C3']);
  });
});

// ETP-6084 D6/D4: mixed-level charts and dimension rows.
describe('reportTree — mixed levels and dimension rows (ETP-6084)', () => {
  // A heading inside a heading, with an account of its own; an account inside an account; an account with no heading above it.
  const MIXED = [
    { node_id: 'E1', parentId: null, elementlevel: 'E' },
    { node_id: 'E2', parentId: 'E1', elementlevel: 'E' },
    { node_id: 'C1', parentId: 'E1', elementlevel: 'C' },
    { node_id: 'C9', parentId: null, elementlevel: 'C' },
    { node_id: 'C10', parentId: 'C9', elementlevel: 'C' },
    { node_id: 'S1', parentId: 'C10', elementlevel: 'S' },
  ];

  it('without `nested` a heading in a heading stays folded at the Heading level (the P&L rule)', () => {
    expect(ids(visibleRows(MIXED, expansionForLevel(MIXED, 'E')))).toEqual(['E1', 'C9']);
  });

  it('with `nested` the level shows same-level nodes and folds the deeper children of their parent', () => {
    const open = expansionForLevel(MIXED, 'E', { nested: true });
    expect(ids(visibleRows(MIXED, open, levelHiddenIds(MIXED, 'E')))).toEqual(['E1', 'E2', 'C9']);
    // At Account: the heading is above the level (open), the nested account is shown, its subaccount folded.
    const openC = expansionForLevel(MIXED, 'C', { nested: true });
    expect(ids(visibleRows(MIXED, openC, levelHiddenIds(MIXED, 'C')))).toEqual(['E1', 'E2', 'C1', 'C9', 'C10']);
  });

  it('a leaf with no ancestor at the level still shows, and Expand all ignores the level fold', () => {
    const rows = [{ node_id: 'E1', parentId: null, elementlevel: 'E' }, { node_id: 'S5', parentId: 'E1', elementlevel: 'S' }];
    expect(ids(visibleRows(rows, expansionForLevel(rows, 'D', { nested: true })))).toEqual(['E1', 'S5']);
    expect(ids(visibleRows(MIXED, foldExpansion(MIXED, { base: 'all', flipped: new Set() }, 'E', { nested: true })))).toEqual(ids(MIXED));
  });

  it('an account with dimension rows starts open at any level and reports hasDimensionChildren', () => {
    const rows = [
      { node_id: 'E1', parentId: null, elementlevel: 'E' },
      { node_id: 'S1', parentId: 'E1', elementlevel: 'S' },
      { node_id: 'S1|B1', parentId: 'S1', elementlevel: 'S', isDimension: true },
    ];
    const shown = visibleRows(rows, expansionForLevel(rows, 'S'));
    expect(ids(shown)).toEqual(['E1', 'S1', 'S1|B1']);
    expect(shown[1]).toMatchObject({ hasChildren: true, hasDimensionChildren: true });
    expect(ids(visibleRows(rows, foldExpansion(rows, { base: 'none', flipped: new Set() }, 'S')))).toEqual(['E1']);
  });
});

// ETP-6083: a fold option that cuts by the indent of the listed rows (`maxIndent`), not by E/C/D/S.
describe('expansionForLevel with maxIndent', () => {
  const TREE = [
    { node_id: 'G1', parentId: null, elementlevel: 'E' },
    { node_id: 'P1', parentId: 'G1', elementlevel: 'E' },
    { node_id: 'C1', parentId: 'P1', elementlevel: 'C' },
    { node_id: 'S1', parentId: 'C1', elementlevel: 'S' },
  ];
  it('Grupo (0) opens nothing; Epígrafe (1) opens the roots only', () => {
    expect([...expansionForLevel(TREE, 'G', { maxIndent: 0 })]).toEqual([]);
    expect([...expansionForLevel(TREE, 'P', { maxIndent: 1 })]).toEqual(['G1']);
    expect(visibleRows(TREE, expansionForLevel(TREE, 'P', { maxIndent: 1 })).map((r) => r.node_id)).toEqual(['G1', 'P1']);
  });
  it('without maxIndent the E/C/D/S rank logic is unchanged', () => {
    expect([...expansionForLevel(TREE, 'C')].sort()).toEqual(['G1', 'P1']);
  });

  describe('folded summaries (balance at a date)', () => {
    const opt = { foldedSummary: true };
    const fold = (rows, open = []) => visibleRows(rows, new Set(open), null, opt);
    const cell = (amount, onTheFly) => ({ amount, ...(onTheFly != null && { result: { onTheFly, posted: amount - onTheFly } }) });
    const leaf = (id, parentId, value, amount, onTheFly) => ({ node_id: id, parentId, elementlevel: 'S', value, amount, cells: [cell(amount, onTheFly)], ...(onTheFly != null && { result: { onTheFly, posted: amount - onTheFly } }) });
    const head = (id, parentId, value, amount) => ({ node_id: id, parentId, elementlevel: 'C', value, amount, cells: [cell(amount)] });

    it('is off by default', () => {
      expect(visibleRows([head('P', null, '129', 60), leaf('L', 'P', '12901000', 60, 60)], new Set())[0].foldedRange).toBeUndefined();
    });

    it('a row made of result accounts alone gets its range and the aggregated result', () => {
      const rows = [head('P', null, '129', 60), leaf('L1', 'P', '12901000', 40, 30), leaf('L2', 'P', '12902000', 20, 10)];
      const [p] = fold(rows);
      expect(p.foldedRange).toEqual({ from: '12901000', to: '12902000' });
      expect(p.result).toEqual({ onTheFly: 40, posted: 20 });
      expect(p.cells[0].result).toEqual({ onTheFly: 40, posted: 20 });
      expect(p.foldedOnTheFly).toBeUndefined();
    });

    it('a mixed row has no result (posted would include other accounts) but carries its on-the-fly part', () => {
      const rows = [head('H', null, '1', 100), leaf('L1', 'H', '12900', 60, 30), leaf('L2', 'H', '12100', 40)];
      const [h] = fold(rows);
      expect(h.result).toBeUndefined();
      expect(h.foldedRange).toEqual({ from: '12100', to: '12900' });
      expect(h.foldedOnTheFly).toEqual([{ amount: 30, sly: null, prev: null }]);
    });

    it('a zero-balance non-result account does not make the row mixed', () => {
      const rows = [head('H', null, '1', 60), leaf('L1', 'H', '12900', 60, 30), leaf('L2', 'H', '12100', 0)];
      expect(fold(rows)[0].result).toEqual({ onTheFly: 30, posted: 30 });
    });

    it('an interleaved range gets no foldedRange; the contiguous one keeps it', () => {
      const rows = [head('X', null, '43', 5), leaf('X1', 'X', '430', 3), leaf('X2', 'X', '432', 2), head('Y', null, '44', 7), leaf('Y1', 'Y', '431', 7)];
      const [x, y] = fold(rows);
      expect(x.foldedRange).toBeUndefined();
      expect(y.foldedRange).toEqual({ from: '431', to: '431' });
      expect(fold(rows, ['X', 'Y']).some((r) => r.foldedRange)).toBe(false);
    });
  });
});
