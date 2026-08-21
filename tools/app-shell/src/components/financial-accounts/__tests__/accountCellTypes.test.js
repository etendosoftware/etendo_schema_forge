/**
 * accountCellTypes — structural contract (source-reading).
 *
 * Behaviour is covered by `accountCellTypes.vitest.jsx`; this file locks the structural
 * invariants that make the ETP-4658 declarative-columns migration survive a pipeline
 * re-run and a future generator change:
 *
 *  - the registry keys ARE the `cellType` values decisions.json declares, so a rename on
 *    either side has to move both;
 *  - `resolveCellType` must nullish-coalesce, because the contract emits `cellType: null`
 *    (not undefined) for a virtual field;
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
  it('exports the registry, the virtual-field map and the resolver', () => {
    assert.match(src, /export const ACCOUNT_CELL_TYPES = \{/);
    assert.match(src, /export const VIRTUAL_FIELD_CELL_TYPES = \{/);
    assert.match(src, /export function resolveCellType\(col\)/);
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
  });
});

describe('accountCellTypes — resolver contract', () => {
  // The contract emits `cellType: null` for a virtual field (appendVirtualFields copies a
  // closed 10-key whitelist that excludes cellType), so `??` is load-bearing: a `||` would
  // work here but a plain `col.cellType ? … : …` chain or a truthy guard would not survive
  // an empty-string cellType. Keep the coalescing explicit.
  it('nullish-coalesces the declared cellType onto the virtual-field fallback', () => {
    assert.match(src, /return col\.cellType \?\? VIRTUAL_FIELD_CELL_TYPES\[col\.name\];/);
  });

  it('maps pendingCount onto the reconcile pill', () => {
    assert.match(src, /pendingCount: 'reconcilePill'/);
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
