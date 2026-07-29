/**
 * AccountsHeaderTable — structural contract (source-reading).
 *
 * Behaviour lives in
 * `tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable*.vitest.jsx`
 * (vitest only collects `src/**`, so an artifact component's React tests are hosted there and
 * imported through the `@generated` alias). This file locks the structural invariants that
 * make the ETP-4658 migration survive a pipeline re-run:
 *
 *  - it is the `headerTable` slot, so it must consume ListView's `data` / `meta` / `onDataMutated`
 *    props rather than fetching the retired `financial-accounts-page` R spec itself;
 *  - the data columns must keep coming from the contract (`getContractGridColumns('account')`),
 *    so hiding/reordering a column stays a decisions.json edit;
 *  - the two synthetic columns must keep swallowing their own clicks, otherwise the row
 *    navigation fires underneath them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'AccountsHeaderTable.jsx'), 'utf8');

describe('AccountsHeaderTable — module shape', () => {
  it('default-exports the slot component', () => {
    assert.match(src, /export default function AccountsHeaderTable\(\{/);
  });

  it('reads its rows and aggregates from the ListView slot props', () => {
    assert.match(src, /export default function AccountsHeaderTable\(\{ data, meta, onDataMutated, \.\.\.props \}\)/);
  });

  it('exports filterAccounts so the filtering rules are directly testable', () => {
    assert.match(src, /export function filterAccounts\(accounts, typeFilter, search\)/);
  });

  it('does not fetch the retired financial-accounts-page R spec', () => {
    // The header comment still explains why that R spec is gone, so match on code only.
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /useFinancialAccounts/);
    assert.doesNotMatch(code, /\/sws\/neo/);
    assert.doesNotMatch(code, /fetch\(/);
  });
});

describe('AccountsHeaderTable — contract-driven columns', () => {
  it('builds the data columns from the contract grid definition', () => {
    assert.match(src, /import \{ getContractGridColumns \} from '@\/components\/financial-accounts\/contractColumns\.js'/);
    assert.match(src, /getContractGridColumns\('account'\)/);
  });

  it('adds exactly the two synthetic columns on top of the contract ones', () => {
    assert.match(src, /key: 'pendingCount'/);
    assert.match(src, /key: '_rowActions'/);
  });

  it('feeds the per-column chrome through DataTable\'s headClass / cellClass', () => {
    assert.match(src, /headClass:/);
    assert.match(src, /cellClass:/);
  });

  it('reuses the shared cell bodies instead of re-implementing them', () => {
    assert.match(src, /import \{\s*NameCell,\s*TypeCell,\s*BalanceCell,\s*\} from '@\/components\/financial-accounts\/AccountsTable\/accountColumns\.jsx'/s);
    assert.match(src, /import \{ AccountRowActions \} from '@\/components\/financial-accounts\/AccountRowActions\.jsx'/);
  });
});

describe('AccountsHeaderTable — row interaction guards', () => {
  it('stops propagation on both synthetic cells so a row click does not fire', () => {
    const guards = src.match(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/g) ?? [];
    assert.equal(guards.length, 2, 'expected the pill cell and the actions cell to guard their clicks');
  });

  // DataTable invokes onNavigate with the whole ROW, not an id (DataTable.jsx:1902,
  // `onNavigate(row)`). Naming the parameter `id` sent row clicks to
  // /financial-account/[object Object], so the handler must go through onOpen, which
  // reads `account.id`. Behavioural coverage:
  // tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable.vitest.jsx
  it('routes a row click through onOpen, which takes the row (not an id)', () => {
    assert.match(src, /onNavigate=\{\(row\) => handlers\.onOpen\(row\)\}/);
    assert.match(src, /onOpen:\s*\(account\) => navigate\(`\/financial-account\/\$\{account\.id\}`\)/);
    assert.doesNotMatch(src, /onNavigate=\{\(id\) =>/, 'the id-shaped handler is the bug this guards');
  });
});

describe('AccountsHeaderTable — sidebar aggregates', () => {
  it('feeds the sidebar from meta.summary, the sibling of response.data', () => {
    assert.match(src, /summary=\{meta\?\.summary \?\? null\}/);
  });
});

describe('AccountsHeaderTable — i18n', () => {
  it('resolves every column label through useUI (no hardcoded strings)', () => {
    assert.match(src, /import \{ useUI, useLocaleSwitch \} from '@\/i18n'/);
    assert.match(src, /labels: \{ \[locale\]: ui\(COLUMN_LABEL_KEY\[col\.name\] \?\? col\.name\) \}/);
  });
});
