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
 *    so hiding/reordering a column stays a decisions.json edit — and their headers
 *    (`gridLabelKey`) and cell bodies (`cellType` → ACCOUNT_CELL_TYPES) must stay declarative
 *    too, i.e. no hardcoded label map and no hand-written column literal may come back;
 *  - the one hand-appended column (`_rowActions`) must keep swallowing its own clicks,
 *    otherwise the row navigation fires underneath it.
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

  it('keys every data column off the contract field name', () => {
    assert.match(src, /key: col\.name/);
  });

  it('adds exactly one hand-written column on top of the contract ones', () => {
    // `_rowActions` is the only literal left: its declarative equivalent
    // (`window.rowQuickActions`) renders an absolute hover overlay, not a column, and
    // every action opens a local modal.
    assert.match(src, /key: '_rowActions'/);
    const literals = src.match(/key: '[^']+'/g) ?? [];
    assert.deepEqual(literals, ["key: '_rowActions'"]);
  });

  // "Por conciliar" is an `entities.account.virtualFields[]` entry in decisions.json now
  // (the NeoHandler injects pendingCount in afterHandle), so it must arrive through the
  // contract like any other column instead of being appended here.
  it('does not hand-append the pendingCount column', () => {
    assert.doesNotMatch(src, /key: 'pendingCount'/);
    assert.doesNotMatch(src, /<ReconcilePill/);
    assert.doesNotMatch(src, /ReconcilePill \}/);
  });

  it('feeds the per-column chrome through DataTable\'s headClass / cellClass', () => {
    assert.match(src, /headClass:/);
    assert.match(src, /cellClass:/);
  });

  // DataTable appends `text-right tabular-nums` itself for numeric column types
  // (DataTable.jsx:1423), so restating it in the chrome only duplicated the class.
  it('leaves numeric alignment to DataTable rather than pinning it in the chrome', () => {
    assert.doesNotMatch(src, /text-right/);
    assert.match(src, /type: col\.type/);
  });

  it('binds the cell bodies through the cellType registry, not a local map', () => {
    assert.match(
      src,
      /import \{\s*ACCOUNT_CELL_TYPES,\s*resolveCellType,\s*\} from '@\/components\/financial-accounts\/accountCellTypes\.jsx'/s,
    );
    assert.match(src, /ACCOUNT_CELL_TYPES\[resolveCellType\(col\)\]/);
    assert.match(src, /import \{ AccountRowActions \} from '@\/components\/financial-accounts\/AccountRowActions\.jsx'/);
  });

  // The regression this guards: a per-field-name map of renderers or labels makes the
  // column set silently diverge from decisions.json, so the pipeline stops being the
  // source of truth. Both maps existed before ETP-4658 and must not come back.
  it('keeps no hardcoded per-field renderer or label map', () => {
    assert.doesNotMatch(src, /CELL_BODIES/);
    assert.doesNotMatch(src, /COLUMN_LABEL_KEY/);
  });

  // An unknown cellType must leave the column without a `render` so DataTable falls back
  // to its generic type-based renderer. Degradation, never a crash.
  it('degrades to no renderer when the cellType resolves to nothing', () => {
    assert.match(src, /render: renderer \? \(row\) => renderer\(row, cellCtx\) : undefined/);
  });
});

describe('AccountsHeaderTable — row interaction guards', () => {
  it('stops propagation on the actions cell so a row click does not fire', () => {
    // The pill's own guard moved into `accountCellTypes.jsx` with its renderer, so only
    // the hand-written actions column still guards here.
    const guards = src.match(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/g) ?? [];
    assert.equal(guards.length, 1, 'expected the actions cell to guard its clicks');
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

describe('AccountsHeaderTable — grid presentation', () => {
  // The rows read as raised cards in this list, which the retired page did with
  // `hover:z-10 hover:shadow-lg` on its own <tr>. The generic DataTable now owns that as a
  // prop, so the slot must ASK for it rather than restyling rows itself — otherwise the
  // shadow room DataTable reserves under the last row would not be reserved either.
  it('asks DataTable for the elevated row hover instead of restyling rows itself', () => {
    assert.match(src, /rowHoverStyle="elevated"/);
    // The comment above that prop names the classes the retired page used, so match on
    // code only — same treatment as the retired-R-spec guard above.
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /hover:shadow-lg/);
    assert.doesNotMatch(code, /hover:z-10/);
  });
});

describe('AccountsHeaderTable — sidebar aggregates', () => {
  it('feeds the sidebar from meta.summary, the sibling of response.data', () => {
    assert.match(src, /summary=\{meta\?\.summary \?\? null\}/);
  });
});

describe('AccountsHeaderTable — i18n', () => {
  it('resolves the column labels through useUI (no hardcoded strings)', () => {
    assert.match(src, /import \{ useUI, useLocaleSwitch \} from '@\/i18n'/);
    // The key itself comes off the contract (`gridLabelKey`), so relabelling a header is
    // a decisions.json edit + regen rather than a JSX change.
    assert.match(src, /labels: col\.gridLabelKey \? \{ \[locale\]: ui\(col\.gridLabelKey\) \} : undefined/);
  });

  // `labels[locale]` is resolveColumnLabel's top-priority branch, so handing it an empty
  // override would blank the header. A column without a gridLabelKey must fall through to
  // `label` / `column` instead — which is why `column` has to be forwarded at all.
  it('falls back to the contract label and AD column when no gridLabelKey is declared', () => {
    assert.match(src, /label: col\.label/);
    assert.match(src, /column: col\.column/);
  });
});
