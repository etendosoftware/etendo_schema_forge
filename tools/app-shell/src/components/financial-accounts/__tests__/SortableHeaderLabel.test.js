/**
 * SortableHeaderLabel — structural contract (source-reading).
 *
 * Behaviour is exercised through the three grids that use it (MovementsTable,
 * StatementsTable, ReconciliationListTable vitest suites). This file pins the structural
 * decisions and satisfies the repo's `.test.js`-only coverage detection for a new source file.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SortableHeaderLabel.jsx'), 'utf8');
// Comments stripped for the "must not contain" assertions: the component's own doc comment
// explains WHY it renders no header cell, and naming <TableHead> there must not fail the test.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('SortableHeaderLabel — structure', () => {
  // It renders the label + arrow only, never the cell: one consumer is a real <table> with
  // <TableHead> cells, the other two are CSS-grid `div role="table"` layouts with <span> cells.
  it('renders no header cell of its own', () => {
    assert.doesNotMatch(code, /<TableHead/);
    assert.doesNotMatch(code, /role="columnheader"/);
  });

  it('degrades to a plain label when no onSort is supplied', () => {
    assert.match(src, /if \(!onSort\) return <span>\{label\}<\/span>;/);
  });

  it('exposes the same per-column testid the generic DataTable header uses', () => {
    assert.match(src, /data-testid=\{`column-header-sort-\$\{sortKey\}`\}/);
  });

  // Same glyphs as DataTable.renderColumnHeaderCell, so a sorted column reads identically
  // whether the grid is generic or hand-rolled.
  it('uses DataTable\'s arrow glyphs and marks them decorative', () => {
    assert.match(src, /▲/);
    assert.match(src, /▼/);
    assert.match(src, /aria-hidden="true"/);
  });
});
