import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../ListView.jsx', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// ListView.jsx — source-reading tests (ETP-3660)
//
// The component depends on React + hooks + router and cannot be rendered in
// a pure Node environment. We verify the structural contract of the three
// new props through static source analysis.
// ---------------------------------------------------------------------------

describe('ListView — selectionBarRightActions prop (ETP-3660)', () => {
  it('declares selectionBarRightActions as a prop with null default', () => {
    assert.match(src, /selectionBarRightActions\s*=\s*null/);
  });

  it('renders selectionBarRightActions inside the selection bar when truthy', () => {
    assert.match(src, /selectionBarRightActions\s*&&\s*selectionBarRightActions\s*\(/);
  });

  it('passes selectedRows to selectionBarRightActions callback', () => {
    assert.match(src, /selectionBarRightActions\s*\(\s*\{[\s\S]*?selectedRows/);
  });

  it('passes clearSelection to selectionBarRightActions callback', () => {
    assert.match(src, /selectionBarRightActions\s*\(\s*\{[\s\S]*?clearSelection/);
  });

  it('passes token to selectionBarRightActions callback', () => {
    assert.match(src, /selectionBarRightActions\s*\(\s*\{[\s\S]*?token/);
  });

  it('passes apiBaseUrl to selectionBarRightActions callback', () => {
    assert.match(src, /selectionBarRightActions\s*\(\s*\{[\s\S]*?apiBaseUrl/);
  });

  it('passes onDataMutated (hook.refresh) to selectionBarRightActions callback', () => {
    assert.match(src, /onDataMutated\s*:\s*hook\.refresh/);
  });
});

describe('ListView — selectionBarSize prop (ETP-3660)', () => {
  it('declares selectionBarSize with default value "sm"', () => {
    assert.match(src, /selectionBarSize\s*=\s*['"]sm['"]/);
  });

  it('passes selectionBarSize as size to selection bar Buttons', () => {
    assert.match(src, /size=\{selectionBarSize\}/);
  });

  it('uses selectionBarSize to conditionally size icons (sm → h-3.5, else → h-4)', () => {
    assert.match(src, /selectionBarSize\s*===\s*['"]sm['"]\s*\?\s*['"]h-3\.5 w-3\.5['"]\s*:\s*['"]h-4 w-4['"]/);
  });
});

describe('ListView — clearSelection / clearSelectionTrigger (ETP-3660)', () => {
  it('declares clearSelectionCounter state starting at 0', () => {
    assert.match(src, /clearSelectionCounter\s*,\s*setClearSelectionCounter\s*\]\s*=\s*useState\s*\(\s*0\s*\)/);
  });

  it('clearSelection resets selectedRows to empty array', () => {
    assert.match(src, /setSelectedRows\s*\(\s*\[\s*\]\s*\)/);
  });

  it('clearSelection increments clearSelectionCounter', () => {
    assert.match(src, /setClearSelectionCounter\s*\(\s*\(c\)\s*=>\s*c\s*\+\s*1\s*\)/);
  });

  // ETP-4658 moved the Table's props into a single `tableProps` object (they used to be
  // written out once per wrapper, which Sonar flagged as a duplicated block), so the
  // binding is an object property rather than a JSX attribute. Both halves of the chain
  // are asserted — the binding AND the spread that delivers it — so this cannot pass
  // again on a `tableProps` that is built but never handed to the Table.
  it('passes clearSelectionCounter as clearSelectionTrigger to the Table', () => {
    assert.match(src, /clearSelectionTrigger:\s*clearSelectionCounter/);
    assert.match(src, /<Table\s+\{\.\.\.tableProps\}/);
  });

  it('clearSelection is a stable useCallback with no deps', () => {
    assert.match(src, /clearSelection\s*=\s*useCallback\s*\([\s\S]*?\[\s*\]\s*\)/);
  });
});
