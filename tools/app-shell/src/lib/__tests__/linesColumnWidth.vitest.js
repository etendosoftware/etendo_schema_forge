import { describe, it, expect } from 'vitest';
import { columnFlex, isLineGridColumn } from '../linesColumnWidth.js';

describe('columnFlex — selector/search/foreignKey idx branch', () => {
  it('selector at idx=0 returns elastic flex (1 1 192px)', () => {
    expect(columnFlex({ type: 'selector' }, 0)).toBe('1 1 192px');
  });

  it('selector at idx>0 returns fixed flex (0 0 192px)', () => {
    expect(columnFlex({ type: 'selector' }, 1)).toBe('0 0 192px');
  });

  it('search at idx=0 returns elastic flex', () => {
    expect(columnFlex({ type: 'search' }, 0)).toBe('1 1 192px');
  });

  it('foreignKey at idx=0 returns elastic flex', () => {
    expect(columnFlex({ type: 'foreignKey' }, 0)).toBe('1 1 192px');
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
});
