import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5198 — "Bloqueado" (`locked`) and "Contacto" (`businessPartner`) must not be
 * offered as grid columns (and therefore not as filter options) on the Users list.
 *
 * Neither field is user-editable from the grid: `locked` is a `readOnly`/computed
 * field (system-derived, never entered by a human) and `businessPartner` is not a
 * meaningful list-level filter for this window. Despite that, `artifacts/user/decisions.json`
 * currently sets `"grid": true` for both, so `generate-frontend.js` emits them into
 * `UserTable.jsx`'s `columns` array — and every grid column feeds
 * `AdvancedFilterButton`/`AdvancedFilterBuilder`'s filter option list (its
 * `isFilterableColumn` guard excludes `discarded`/`system` type or explicit
 * `filterable: false`, but does NOT look at `visibility`), so both fields also show
 * up as filter options they should never have offered.
 *
 * This test checks BOTH layers so a fix that touches only one of them is still
 * caught:
 *   1. `contract.json` — the resolved-curated contract must carry `grid: false`
 *      for both fields (the field decisions.json controls directly).
 *   2. The generated `UserTable.jsx` — its `columns` array (which is what actually
 *      reaches `DataTable`/`AdvancedFilterButton` at runtime) must not list either
 *      field's `key`.
 *
 * Fix (tracked as a separate follow-up commit, NOT part of this one): set
 * `"grid": false` for `locked` and `businessPartner` in `artifacts/user/decisions.json`,
 * then `make regen ONLY=user` to regenerate `contract.json` + `UserTable.jsx`.
 *
 * This test is EXPECTED TO FAIL until that fix lands — it exists to prove the bug
 * reproduces before the fix, per this repo's two-commit bug workflow.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

const CONTRACT_PATH = join(REPO_ROOT, 'artifacts', 'user', 'contract.json');
const TABLE_PATH = join(
  REPO_ROOT,
  'artifacts',
  'user',
  'generated',
  'web',
  'user',
  'UserTable.jsx',
);

const FIELDS_THAT_MUST_NOT_BE_GRID_COLUMNS = ['locked', 'businessPartner'];

function loadContractFields() {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  return contract.frontendContract.entities.user.fields;
}

/**
 * Extracts the `key: '<name>'` values from the `const columns = [ ... ];` array
 * literal in a generated `*Table.jsx` file, without needing a JSX/Babel parser —
 * same text-based approach used by sibling generated-output regression tests
 * (see `tools/app-shell/test/funds-transfer-props.test.js`).
 */
function extractColumnKeys(tableSource) {
  const arrayMatch = tableSource.match(/const columns = \[([\s\S]*?)\n\];/);
  assert.ok(arrayMatch, 'UserTable.jsx must declare a `const columns = [...]` array literal');
  const body = arrayMatch[1];
  const keyMatches = [...body.matchAll(/key:\s*'([^']+)'/g)];
  return keyMatches.map((m) => m[1]);
}

describe('ETP-5198 — user grid/filter fields (locked, businessPartner)', () => {
  const contractFields = loadContractFields();
  const tableSource = readFileSync(TABLE_PATH, 'utf8');
  const columnKeys = extractColumnKeys(tableSource);

  for (const fieldName of FIELDS_THAT_MUST_NOT_BE_GRID_COLUMNS) {
    it(`contract.json marks '${fieldName}' as grid: false`, () => {
      const field = contractFields.find((f) => f.name === fieldName);
      assert.ok(field, `Expected a '${fieldName}' field in artifacts/user/contract.json`);
      assert.equal(
        field.grid,
        false,
        `'${fieldName}' must have grid: false in contract.json (set "grid": false in `
        + 'artifacts/user/decisions.json and run `make regen ONLY=user`) — it is not '
        + 'editable from the grid and must not be offered as a list column or filter.',
      );
    });

    it(`generated UserTable.jsx does not list '${fieldName}' as a column`, () => {
      assert.ok(
        !columnKeys.includes(fieldName),
        `UserTable.jsx's columns array must not include '${fieldName}' (found: `
        + `[${columnKeys.join(', ')}]) — every grid column is also offered as an `
        + 'AdvancedFilterButton filter option, and this field must not be filterable.',
      );
    });
  }
});
