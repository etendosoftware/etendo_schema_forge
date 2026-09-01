/**
 * Structural guard for `useRowSelection` (ETP-4950).
 *
 * The hook's behaviour is covered by `useRowSelection.vitest.jsx` (it needs React + jsdom, which
 * plain `node --test` cannot provide). This source-reading companion locks the invariants a future
 * edit could break silently — the prune-to-visible effect, its same-Set short circuit, and the
 * "an empty grid is not all-selected" guard — and keeps the hook covered by a `.test.js` the
 * missing-tests detector recognises.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useRowSelection.js'), 'utf8');

describe('useRowSelection (source contract)', () => {
  it('exports the named hook taking the visible rows', () => {
    assert.match(src, /export function useRowSelection\(rows\)/);
  });

  it('returns the full selection API the grids consume', () => {
    for (const key of [
      'selectedIds',
      'selectedRows',
      'allSelected',
      'someSelected',
      'toggleSelect',
      'toggleSelectAll',
      'clearSelection',
      'keepOnly',
    ]) {
      assert.match(src, new RegExp(`\\n\\s{4}${key}[,:]`), `missing "${key}" in the returned object`);
    }
  });

  it('holds the selection as a Set, seeded lazily so it is not rebuilt every render', () => {
    assert.match(src, /useState\(\(\) => new Set\(\)\)/);
  });

  it('derives the selectable ids from the rows, skipping falsy ones', () => {
    assert.match(src, /\(rows \?\? \[\]\)\.map\(\(row\) => row\?\.id\)\.filter\(Boolean\)/);
    assert.match(src, /useMemo\(\(\) => idsOf\(rows\), \[rows\]\)/);
  });

  it('prunes the selection to the visible ids whenever they change', () => {
    assert.match(src, /useEffect\(\(\) => \{\s*setSelectedIds\(\(prev\) => pruneToVisible\(prev, visibleIds\)\);\s*\}, \[visibleIds\]\)/);
  });

  it('short-circuits the prune so an unchanged selection keeps its Set identity', () => {
    // Returning a fresh Set on every rows change would re-render the whole grid (and re-run every
    // memo keyed on selectedIds) on each keystroke of the search box.
    assert.match(src, /return next\.size === selected\.size \? selected : next;/);
    assert.match(src, /if \(selected\.size === 0\) return selected;/);
  });

  it('never mutates the previous Set in place', () => {
    assert.doesNotMatch(src, /prev\.(add|delete|clear)\(/);
    assert.doesNotMatch(src, /selected\.(add|delete|clear)\(/);
    assert.match(src, /const next = new Set\(selected\)/);
  });

  it('flips a single id without touching the rest', () => {
    assert.match(src, /if \(next\.has\(id\)\) next\.delete\(id\); else next\.add\(id\);/);
  });

  it('makes select-all a toggle against the visible count', () => {
    assert.match(src, /prev\.size === visibleIds\.length \? new Set\(\) : new Set\(visibleIds\)/);
  });

  it('requires at least one row for allSelected — an empty grid is not fully selected', () => {
    assert.match(src, /const allSelected = visibleIds\.length > 0 && selectedIds\.size === visibleIds\.length/);
  });

  it('makes someSelected mean strictly partial', () => {
    assert.match(src, /someSelected: selectedIds\.size > 0 && !allSelected/);
  });

  it('treats keepOnly with no ids as a clear', () => {
    assert.match(src, /keepOnly = useCallback\(\(ids\) => setSelectedIds\(new Set\(ids \?\? \[\]\)\)/);
  });

  it('tolerates a missing row list when mapping the selected rows', () => {
    assert.match(src, /\(rows \?\? \[\]\)\.filter\(\(row\) => selectedIds\.has\(row\?\.id\)\)/);
  });

  it('memoises selectedRows on both rows and the selection', () => {
    assert.match(src, /\[rows, selectedIds\]/);
  });

  it('keeps the id-independent handlers stable with empty dependency lists', () => {
    assert.match(src, /toggleSelect = useCallback\([\s\S]*?\}, \[\]\)/);
    assert.match(src, /clearSelection = useCallback\(\(\) => setSelectedIds\(new Set\(\)\), \[\]\)/);
  });

  it('re-creates toggleSelectAll when the visible ids change', () => {
    assert.match(src, /toggleSelectAll = useCallback\([\s\S]*?\}, \[visibleIds\]\)/);
  });

  it('stays a pure state hook — no data fetching', () => {
    assert.doesNotMatch(src, /(^|[^.\w])fetch\(/m);
    assert.doesNotMatch(src, /useApiFetch/);
  });
});
