/**
 * Cuentas list — declarative column contract (decisions.json → contract.json → generated).
 *
 * ETP-4658 moved everything about the Cuentas LIST columns out of JSX and into
 * `decisions.json`: which columns appear (`grid` + `gridOrder`), their headers
 * (`gridLabelKey`), their cell bodies (`cellType`) and the suppression of the generic
 * quick-actions overlay (`window.rowQuickActions.enabled: false`).
 *
 * "Por conciliar" used to be the one exception — a runtime-injected
 * `entities.account.virtualFields[]` entry. It is now the `EM_ETGO_Pending_Count` stored
 * computed column, so all five columns are declared the same way and the two workarounds a
 * virtual field needed (`VIRTUAL_FIELD_CELL_TYPES`, `window.labelOverrides`) are gone.
 *
 * This file is the pipeline-integrity half of that migration: it pins the DECLARATIONS and
 * checks they survived the regen, so a future `make regen ONLY=financial-account` cannot
 * silently drop a column, a header key or a renderer binding. The consuming JSX is covered
 * by `AccountsHeaderTable.test.js` (structure) and
 * `tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable.vitest.jsx`
 * (behaviour); the registry itself by
 * `tools/app-shell/src/components/financial-accounts/__tests__/accountCellTypes.vitest.jsx`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactDir = join(__dirname, '..', '..');
const repoRoot = join(artifactDir, '..', '..');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const decisions = readJson(join(artifactDir, 'decisions.json'));
const contract = readJson(join(artifactDir, 'contract.json'));
const accountPageSrc = readFileSync(
  join(artifactDir, 'generated', 'web', 'financial-account', 'AccountPage.jsx'),
  'utf8',
);
const registrySrc = readFileSync(
  join(repoRoot, 'tools', 'app-shell', 'src', 'components', 'financial-accounts', 'accountCellTypes.jsx'),
  'utf8',
);

const accountDecisions = decisions.entities.account;
const contractGridFields = contract.frontendContract.entities.account.fields
  .filter((f) => f.grid === true && f.gridOrder != null)
  .sort((a, b) => a.gridOrder - b.gridOrder);

// The five columns the Cuentas list renders, in gridOrder, with the renderer each binds.
const EXPECTED_COLUMNS = [
  { name: 'name', gridLabelKey: 'financeAccountsColAccount', cellType: 'accountName' },
  { name: 'type', gridLabelKey: 'financeAccountsColType', cellType: 'accountType' },
  // ETP-4896 follow-up: inserted right after Type.
  { name: 'country', gridLabelKey: 'financeAccountsColCountry', cellType: 'accountCountry' },
  { name: 'currentBalance', gridLabelKey: 'financeAccountsColBalance', cellType: 'accountBalance' },
  // Stored computed column (EM_ETGO_Pending_Count): a real field now, so unlike the virtual
  // field it replaced it declares its own header key and renderer.
  { name: 'eTGOPendingCount', gridLabelKey: 'financeAccountsColPending', cellType: 'reconcilePill' },
];

describe('Cuentas list — decisions.json declares the grid columns', () => {
  it('gives each real grid field an explicit gridOrder', () => {
    const declared = Object.entries(accountDecisions.fields)
      .filter(([, f]) => f.grid === true)
      .map(([name, f]) => ({ name, gridOrder: f.gridOrder }))
      .sort((a, b) => a.gridOrder - b.gridOrder);

    assert.deepEqual(declared, [
      { name: 'name', gridOrder: 1 },
      { name: 'type', gridOrder: 2 },
      { name: 'country', gridOrder: 3 },
      { name: 'currentBalance', gridOrder: 4 },
      { name: 'eTGOPendingCount', gridOrder: 5 },
    ]);
  });

  it('declares the header i18n key and the cell renderer per grid field', () => {
    for (const col of EXPECTED_COLUMNS.filter((c) => c.gridLabelKey)) {
      const field = accountDecisions.fields[col.name];
      assert.equal(field.gridLabelKey, col.gridLabelKey, `${col.name}.gridLabelKey`);
      assert.equal(field.cellType, col.cellType, `${col.name}.cellType`);
    }
  });

  // "Por conciliar" is a real AD-backed field, not a runtime injection. A value injected in
  // afterHandle can only be reordered inside the page the SQL already selected, so it could
  // never be sorted — that is why it became a stored computed column.
  it('declares eTGOPendingCount as a real field, not a virtual one', () => {
    assert.equal(
      accountDecisions.virtualFields,
      undefined,
      'this entity has no virtual fields left — do not reintroduce one for Por conciliar',
    );

    const pending = accountDecisions.fields.eTGOPendingCount;
    assert.ok(pending, 'entities.account.fields must declare eTGOPendingCount');
    assert.equal(pending.visibility, 'readOnly');
    assert.equal(pending.form, false, 'it is a list-only column, never a form field');
    assert.equal(pending.grid, true);
    assert.equal(pending.gridOrder, 5, 'it must come last, after the four other columns');
    assert.equal(pending.gridLabelKey, 'financeAccountsColPending');
    assert.equal(pending.cellType, 'reconcilePill');
  });

  // The override existed ONLY to relabel the virtual field, whose gridLabelKey
  // appendVirtualFields dropped. A real field resolves its header the normal way.
  it('no longer needs window.labelOverrides for the pending column', () => {
    const overrides = decisions.window.labelOverrides ?? {};
    for (const [locale, entries] of Object.entries(overrides)) {
      assert.ok(
        !('pendingCount' in entries) && !('eTGOPendingCount' in entries),
        `window.labelOverrides.${locale} must not relabel the pending column any more`,
      );
    }
  });

  // The list owns its actions through the trailing AccountRowActions column, so the
  // generic absolute hover overlay would double them up.
  it('suppresses the generic row quick-actions overlay declaratively', () => {
    assert.deepEqual(decisions.window.rowQuickActions, { enabled: false });
  });
});

describe('Cuentas list — the regen carried the declarations into contract.json', () => {
  it('emits the five grid columns in the declared gridOrder', () => {
    assert.deepEqual(
      contractGridFields.map((f) => f.name),
      EXPECTED_COLUMNS.map((c) => c.name),
    );
  });

  it('carries gridLabelKey and cellType through to the contract', () => {
    for (const expected of EXPECTED_COLUMNS) {
      const field = contractGridFields.find((f) => f.name === expected.name);
      assert.equal(field.gridLabelKey ?? null, expected.gridLabelKey, `${expected.name}.gridLabelKey`);
      assert.equal(field.cellType ?? null, expected.cellType, `${expected.name}.cellType`);
    }
  });

  // `resolveColumnLabel` feeds `column` to the AD dictionary and ListView's ReportDrawer
  // maps on it, so every grid column needs one.
  it('gives every grid column an AD column name', () => {
    for (const field of contractGridFields) {
      assert.ok(field.column, `${field.name} must carry a column`);
    }
  });

  it('propagates the quick-actions suppression to the frontend contract', () => {
    assert.deepEqual(contract.frontendContract.window.rowQuickActions, { enabled: false });
  });

  // A cellType that no renderer answers to would leave the column with DataTable's generic
  // type renderer — silently losing the bank avatar / PSD2 affordance / chunked IBAN. This
  // is the check that catches a typo in decisions.json.
  it('binds every declared cellType to a renderer the registry actually exposes', () => {
    const registryKeys = [...registrySrc.matchAll(/^ {2}(\w+): \(row/gm)].map((m) => m[1]);
    assert.ok(registryKeys.length >= 4, 'failed to parse ACCOUNT_CELL_TYPES');

    for (const field of contractGridFields) {
      if (!field.cellType) continue;
      assert.ok(
        registryKeys.includes(field.cellType),
        `cellType "${field.cellType}" (${field.name}) has no renderer in accountCellTypes.jsx`,
      );
    }
  });

  // The inverse of the assertion this replaced. While "Por conciliar" was a virtual field its
  // cellType could not reach the contract (appendVirtualFields copies a closed whitelist that
  // excludes it), so the registry carried a VIRTUAL_FIELD_CELL_TYPES fallback. As a real field
  // it declares cellType directly, and the fallback must stay deleted — reintroducing it would
  // silently outrank a future declared cellType.
  it('carries the pending column cellType through the contract, with no registry fallback', () => {
    const pending = contractGridFields.find((f) => f.name === 'eTGOPendingCount');

    assert.equal(pending.cellType, 'reconcilePill');
    // Anchored on the export, not the identifier: the file still explains in prose why the
    // fallback used to exist, and that comment must not fail this test.
    assert.doesNotMatch(registrySrc, /export const VIRTUAL_FIELD_CELL_TYPES/);
    assert.match(registrySrc, /return col\.cellType;/);
  });

  // The whole point of the migration: NEO's generic orderby needs a real DAL property.
  it('backs the pending column with the stored computed AD column', () => {
    const pending = contractGridFields.find((f) => f.name === 'eTGOPendingCount');

    assert.equal(pending.column, 'EM_ETGO_Pending_Count');
    assert.equal(pending.type, 'integer', 'it genuinely counts pending items');
    assert.deepEqual(pending.computed, { mode: 'stored', refresh: 'synchronous' });
  });
});

describe('Cuentas list — the generated AccountPage honours the declarations', () => {
  it('mounts the custom slot through the artifact-relative path', () => {
    assert.match(accountPageSrc, /import AccountTable from '\.\.\/\.\.\/\.\.\/custom\/AccountsHeaderTable'/);
    assert.match(accountPageSrc, /Table=\{AccountTable\}/);
  });

  // The suppression's new home: the generator stops emitting the prop entirely, so the
  // slot no longer has to pass `rowQuickActions={null}` to cancel it.
  it('no longer passes rowQuickActions to ListView', () => {
    assert.doesNotMatch(accountPageSrc, /rowQuickActions/);
  });
});
