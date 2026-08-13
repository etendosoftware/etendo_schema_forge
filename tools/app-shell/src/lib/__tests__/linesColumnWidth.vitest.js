import { describe, it, expect } from 'vitest';
import { columnFlex } from '../linesColumnWidth.js';

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
