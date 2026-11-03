// @covers tools/app-shell/src/components/reports/dynamic/reportTree.js
import { canSplit, expandAll, expansionForLevel, parentIds, visibleRows } from '../reportTree.js';

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
});
