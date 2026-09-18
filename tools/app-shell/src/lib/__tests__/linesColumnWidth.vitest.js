import { describe, it, expect } from 'vitest';
import { columnFlex, isLineGridColumn } from '../linesColumnWidth.js';

describe('columnFlex — selector/search/foreignKey idx branch', () => {
  it('selector at idx=0 returns elastic flex, no shrink (1 0 192px)', () => {
    expect(columnFlex({ type: 'selector' }, 0)).toBe('1 0 192px');
  });

  it('selector at idx>0 returns fixed flex (0 0 192px)', () => {
    expect(columnFlex({ type: 'selector' }, 1)).toBe('0 0 192px');
  });

  it('search at idx=0 returns elastic flex, no shrink', () => {
    expect(columnFlex({ type: 'search' }, 0)).toBe('1 0 192px');
  });

  it('foreignKey at idx=0 returns elastic flex, no shrink', () => {
    expect(columnFlex({ type: 'foreignKey' }, 0)).toBe('1 0 192px');
  });
});

// ETP-4803 — `isLineGridColumn` is the single source of truth both
// InlineLinesPanel and DataTable must filter their `visibleColumns` through
// before computing widths, so a `dimensionsPanel` column (which renders via
// a hover action + expand sub-row, never as a fixed grid column/header
// cell) can't sneak back into just one of the two renderers again.
describe('isLineGridColumn', () => {
  it('excludes dimensionsPanel columns', () => {
    expect(isLineGridColumn({ key: 'dimensions', type: 'dimensionsPanel' })).toBe(false);
  });

  it('includes every other known column type', () => {
    for (const type of ['string', 'amount', 'selector', 'search', 'foreignKey', 'date', 'boolean', 'status']) {
      expect(isLineGridColumn({ type })).toBe(true);
    }
  });

  // ETP-5188 — `filterOnly: true` is a generic, type-independent escape hatch (see
  // `UserHeaderTable.jsx`'s `roleFilterColumn`): a column that exists only to appear in
  // the advanced-filter field list, never as an actual grid cell/header.
  describe('filterOnly (ETP-5188)', () => {
    it('excludes a column explicitly marked filterOnly: true, regardless of type', () => {
      expect(isLineGridColumn({ key: 'roleFilter', type: 'custom', filterOnly: true })).toBe(false);
      expect(isLineGridColumn({ key: 'roleFilter', type: 'string', filterOnly: true })).toBe(false);
    });

    it('includes a column with filterOnly: false (explicit) same as if it were absent', () => {
      expect(isLineGridColumn({ type: 'string', filterOnly: false })).toBe(true);
    });

    it('includes a column with no filterOnly key at all (default behavior unchanged)', () => {
      expect(isLineGridColumn({ type: 'custom' })).toBe(true);
    });

    it('double-exclusion: filterOnly: true AND a NON_GRID_COLUMN_TYPES type still just excludes, does not throw', () => {
      expect(() => isLineGridColumn({ type: 'dimensionsPanel', filterOnly: true })).not.toThrow();
      expect(isLineGridColumn({ type: 'dimensionsPanel', filterOnly: true })).toBe(false);
    });
  });
});
