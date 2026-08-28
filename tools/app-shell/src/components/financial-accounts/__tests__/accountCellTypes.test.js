/**
 * accountCellTypes — structural contract (source-reading).
 *
 * Behaviour is covered by `accountCellTypes.vitest.jsx`; this file locks the structural
 * invariants that make the ETP-4658 declarative-columns migration survive a pipeline
 * re-run and a future generator change:
 *
 *  - the registry keys ARE the `cellType` values decisions.json declares, so a rename on
 *    either side has to move both;
 *  - `resolveCellType` is a plain `col.cellType` read: every grid field of this window
 *    declares its own, so the VIRTUAL_FIELD_CELL_TYPES fallback that "Por conciliar" needed
 *    while it was a virtual field must stay deleted;
 *  - the cell bodies are imported, never re-implemented — the legacy AccountsTable renders
 *    the same three components.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'accountCellTypes.jsx'), 'utf8');

describe('accountCellTypes — module shape', () => {
  it('exports the registry and the resolver, and no virtual-field fallback map', () => {
    assert.match(src, /export const ACCOUNT_CELL_TYPES = \{/);
    assert.match(src, /export function resolveCellType\(col\)/);
    // Anchored on the export, not the identifier: the file still explains in prose why the
    // fallback used to exist, and that comment must not fail this test.
    assert.doesNotMatch(src, /export const VIRTUAL_FIELD_CELL_TYPES = \{/);
  });

  it('declares one renderer per cellType decisions.json can name', () => {
    for (const cellType of [
      'accountName', 'accountType', 'accountCountry', 'accountBalance', 'reconcilePill',
    ]) {
      assert.match(src, new RegExp(`\\n  ${cellType}: \\(row`));
    }
  });

  it('reuses the shared cell bodies instead of re-implementing them', () => {
    // Pins the INVARIANT — every cell body comes from the shared module — rather than the exact
    // destructuring list. The previous literal-list regex broke the moment a cell was added
    // (ETP-4896's CountryCell) even though nothing about the reuse rule had changed, which makes
    // the test read as a tripwire for growth instead of for re-implementation.
    const sharedImport = src.match(
      /import \{([^}]+)\} from '\.\/AccountsTable\/accountColumns\.jsx'/,
    );
    assert.ok(sharedImport, 'the registry must import its cell bodies from accountColumns.jsx');
    const imported = sharedImport[1].split(',').map((name) => name.trim());
    for (const cell of ['NameCell', 'TypeCell', 'CountryCell', 'BalanceCell']) {
      assert.ok(imported.includes(cell), `${cell} must be reused from the shared module`);
    }
    assert.match(src, /import \{ ReconcilePill \} from '\.\/ReconcilePill\.jsx'/);
    // The pill's own prop keeps its short name; what changed is where the value comes from.
    assert.match(src, /pendingCount=\{row\.eTGOPendingCount\}/);
  });
});

describe('accountCellTypes — resolver contract', () => {
  // The contract emits `cellType: null` for a virtual field (appendVirtualFields copies a
  // closed 10-key whitelist that excludes cellType), so `??` is load-bearing: a `||` would
  // work here but a plain `col.cellType ? … : …` chain or a truthy guard would not survive
  // an empty-string cellType. Keep the coalescing explicit.
  it('reads the declared cellType straight off the column', () => {
    assert.match(src, /return col\.cellType;/);
  });

  // The pill is bound by decisions.json (`cellType: "reconcilePill"` on eTGOPendingCount),
  // so the registry must expose that key and must NOT re-map it by field name — a name-keyed
  // fallback would silently outrank a future declared cellType.
  it('exposes reconcilePill as a cellType, not as a per-field mapping', () => {
    assert.match(src, /\n  reconcilePill: \(row/);
    assert.doesNotMatch(src, /(eTGO)?[Pp]endingCount: 'reconcilePill'/);
  });

  it('never hardcodes a fallback renderer — an unknown cellType must degrade to none', () => {
    assert.doesNotMatch(src, /\?\?\s*'account/);
    assert.doesNotMatch(src, /DEFAULT_CELL_TYPE/);
  });
});

describe('accountCellTypes — row interaction guard', () => {
  // The whole row navigates to the account detail, so the pill has to swallow its click.
  it('stops propagation inside the reconcile pill cell', () => {
    assert.match(src, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
});

describe('accountCellTypes — i18n', () => {
  it('takes the label resolver from the cell context, never from a literal', () => {
    assert.match(src, /ui=\{ctx\.ui\}/);
    // No user-visible string may be inlined here; every one comes from the cell bodies.
    assert.doesNotMatch(src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, ''), />[A-Z][a-z]+ [a-z]/);
  });
});
