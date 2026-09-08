import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ETP-5216 regression guard — the exact defect the migration plan set out to fix.
//
// The TicketBAI/Batuz list column used to be pushed as
// `{ key: '_tbaiStatus', type: 'custom' }` with neither a `column` nor a
// `backendFilterKey`. That shape is dropped SILENTLY — no error, no warning,
// no log — from the advanced filter's field list by the private
// `isFilterableColumn()` predicate in
// `@etendosoftware/app-shell-core` (`AdvancedFilterBuilder.jsx`), and even if
// it had not been dropped, `getFilteredKey()` would have sent the backend a
// criteria `fieldName` of `_tbaiStatus` — a name that exists nowhere in the
// DAL (see docs/plans/2026-09-08-tbai-status-computed-column-migration.md §1).
//
// This test does two things for BOTH invoice windows (sales, purchase):
//   1. Extracts the real TicketBAI/Batuz column object literal from the
//      window's own HeaderTable source (no re-implementation of the column,
//      no hardcoded expectation of its shape beyond what the source says).
//   2. Runs it through a verbatim copy of `isFilterableColumn()` (the
//      original is not exported by the package, so it is inlined here with a
//      pointer to its source) and through the REAL, imported
//      `getFilteredKey()` from `@etendosoftware/app-shell-core`.
//
// If anyone reverts either column to a synthetic `type: 'custom'` cell with
// no `column`/`backendFilterKey`, this test fails.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');

const { getFilteredKey } = await import(
  resolve(REPO_ROOT, 'node_modules', '@etendosoftware', 'app-shell-core', 'src', 'lib', 'gridQuery.js')
);

// Verbatim copy of the private predicate at
// node_modules/@etendosoftware/app-shell-core/src/components/contract-ui/AdvancedFilterBuilder.jsx:167-184
// (not exported by the package, so it cannot be imported directly).
function isFilterableColumn(col) {
  if (!col?.key) return false;
  if (col.type === 'discarded' || col.type === 'system') return false;
  if (col.filterable === false) return false;
  if (col.type === 'custom' && !col.column && !col.backendFilterKey && col.filterable !== true) {
    return false;
  }
  return true;
}

/**
 * Extracts the `{ key: 'eTGOTbaiStatus', ... }` object literal pushed inside
 * the `if (targets.showTbai) { fiscalCols.push({ ... }); }` block, up to (but
 * not including) the `render:` function — the render body itself is JSX/JS
 * that a plain object-literal regex cannot safely capture, and this test does
 * not need it.
 */
function extractTbaiColumnMeta(src) {
  // Scope to the `if (targets.showTbai) { ... }` block first — both sources
  // push SII/Verifactu columns too via the same `fiscalCols.push({ ... })`
  // call shape, so an unscoped match would pick up the wrong column.
  const showTbaiBlock = src.match(/if \(targets\.showTbai\) \{([\s\S]*?)\n    \}/);
  if (!showTbaiBlock) return null;
  const block = showTbaiBlock[1].match(/fiscalCols\.push\(\{\s*([\s\S]*?)render:/);
  if (!block) return null;
  const meta = block[1];
  const key = meta.match(/key:\s*'([^']+)'/)?.[1];
  const column = meta.match(/column:\s*'([^']+)'/)?.[1];
  const type = meta.match(/type:\s*'([^']+)'/)?.[1];
  const filterMode = meta.match(/filterMode:\s*'([^']+)'/)?.[1];
  return { key, column, type, filterMode };
}

const WINDOWS = [
  {
    name: 'sales-invoice',
    path: resolve(REPO_ROOT, 'artifacts', 'sales-invoice', 'custom', 'InvoiceHeaderTable.jsx'),
  },
  {
    name: 'purchase-invoice',
    path: resolve(
      REPO_ROOT, 'tools', 'app-shell', 'src', 'windows', 'custom', 'purchase-invoice',
      'PurchaseInvoiceHeaderTable.jsx',
    ),
  },
];

for (const { name, path } of WINDOWS) {
  describe(`${name} — TicketBAI/Batuz column stays a real, filterable AD column (ETP-5216)`, () => {
    const src = readFileSync(path, 'utf8');
    const col = extractTbaiColumnMeta(src);

    it('extracts a TicketBAI/Batuz column object literal from the source', () => {
      assert.ok(col, 'expected a fiscalCols.push({ ... render: }) block in the showTbai branch');
      assert.equal(col.key, 'eTGOTbaiStatus');
    });

    it('carries a real `column` — the field that makes it filterable at all', () => {
      assert.equal(
        col.column,
        'em_etgo_tbai_status',
        'the column must be backed by the real AD column, not a synthetic key with no `column`',
      );
    });

    it('passes isFilterableColumn (the exact predicate that silently dropped the synthetic column)', () => {
      assert.equal(
        isFilterableColumn(col),
        true,
        'a column with `type: custom` and no `column`/`backendFilterKey` is dropped SILENTLY from the advanced filter',
      );
    });

    it('would NOT pass isFilterableColumn if reverted to the pre-ETP-5216 synthetic shape', () => {
      // Documents WHY the fix matters: the exact old shape fails the same
      // predicate, so this is not a tautological assertion.
      const syntheticColumn = { key: '_tbaiStatus', type: 'custom' };
      assert.equal(isFilterableColumn(syntheticColumn), false);
    });

    it('produces a criteria fieldName that is the real DAL property, not the old synthetic key', () => {
      // filterMode 'text' never hits the identifier-suffix branch of
      // getFilteredKey, so the resolved fieldName is the column's own key —
      // which must be the real DAL property name, not `_tbaiStatus`.
      const fieldName = getFilteredKey(col, col.filterMode, 'iContains');
      assert.equal(fieldName, 'eTGOTbaiStatus');
      assert.notEqual(fieldName, '_tbaiStatus');
    });

    it('declares filterMode text (no implicit fallback to a mode this column cannot support)', () => {
      assert.equal(col.filterMode, 'text');
    });
  });
}
