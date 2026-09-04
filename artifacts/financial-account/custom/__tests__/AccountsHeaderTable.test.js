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
 *    otherwise the row navigation fires underneath it;
 *  - `selectedRows` must stay destructured out of the slot props so it never reaches DataTable,
 *    even though ETP-5111 retired the toolbar/selection-bar swap that used to read it — and the
 *    toolbar must stay ungated, so the retired swap cannot creep back in.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'AccountsHeaderTable.jsx'), 'utf8');

/**
 * The default export's destructured parameter list, split into its parts with comments
 * removed. Asserting on WHICH props the slot consumes has to survive the signature being
 * reflowed across lines or a comment landing between two names — the prop set is the
 * invariant, its formatting is not.
 */
const destructuredParams = (() => {
  const signature = src.match(/export default function AccountsHeaderTable\(\{([\s\S]*?)\}\)\s*\{/);
  assert.ok(signature, 'the slot must destructure its props in the signature');
  return signature[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
})();

/** Same list reduced to bare names, so a default value (`meta = {}`) still matches. */
const destructuredNames = destructuredParams.map(
  (part) => part.replace(/^\.\.\./, '').split('=')[0].trim(),
);

describe('AccountsHeaderTable — module shape', () => {
  it('default-exports the slot component', () => {
    assert.match(src, /export default function AccountsHeaderTable\(\{/);
  });

  it('reads its rows and aggregates from the ListView slot props', () => {
    for (const prop of ['data', 'meta', 'onDataMutated']) {
      assert.ok(
        destructuredNames.includes(prop),
        `the slot must keep consuming ListView's \`${prop}\` prop, got: ${destructuredParams.join(', ')}`,
      );
    }
    // Everything else ListView hands the slot has to keep flowing to DataTable untouched
    // (selection triggers, pagination, sorting), which is what the rest element carries.
    assert.ok(
      destructuredParams.includes('...props'),
      `the remaining ListView props must reach DataTable through a rest element, got: ${destructuredParams.join(', ')}`,
    );
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

  // "Por conciliar" is the `EM_ETGO_Pending_Count` stored computed column, declared in
  // decisions.json like every other grid field, so it must arrive through the contract
  // instead of being appended here. Both the old virtual-field name and the new one are
  // checked: neither may reappear as a hand-built column.
  it('does not hand-append the pending column', () => {
    assert.doesNotMatch(src, /key: 'pendingCount'/);
    assert.doesNotMatch(src, /key: 'eTGOPendingCount'/);
    assert.doesNotMatch(src, /<ReconcilePill/);
    assert.doesNotMatch(src, /ReconcilePill \}/);
  });

  it('feeds the per-column chrome through DataTable\'s headClass / cellClass', () => {
    assert.match(src, /headClass:/);
    assert.match(src, /cellClass:/);
  });

  // DataTable appends `text-right tabular-nums` itself for numeric column types
  // (DataTable.jsx:1423), so restating it in the chrome only duplicated the class.
  // The one exception is `GRID_TYPE_OVERRIDE`: `eTGOPendingCount` is contractually
  // "integer" (it IS a count) but always renders through `reconcilePill`, never as a
  // right-aligned number, so its DataTable-facing `type` is overridden to keep the
  // pill left-aligned like every other status cell — see the constant's own comment.
  it('leaves numeric alignment to DataTable rather than pinning it in the chrome', () => {
    assert.doesNotMatch(src, /text-right/);
    assert.match(src, /type: GRID_TYPE_OVERRIDE\[col\.name\] \?\? col\.type/);
  });

  it('only overrides the grid type for the pending column, not any other', () => {
    assert.match(src, /const GRID_TYPE_OVERRIDE = \{\s*eTGOPendingCount: 'string',\s*\}/);
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

// ETP-4656 wired a "selection bar replaces the toolbar" swap here, because ListView renders its
// selection bar as a SIBLING of this slot and cannot reach inside it. ETP-5111 RETIRED that swap:
// with the bar reduced to a floating pill (ETP-4972) it replaced nothing and merely took the
// toolbar's own actions away from a user who had ticked a checkbox. What this block locks now is
// the retirement itself — the toolbar is unconditional — plus the one piece of the old wiring that
// had to STAY. Behaviour is covered in
// tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable.vitest.jsx
// ("toolbar stays mounted across selection changes").
describe('AccountsHeaderTable — selection handling', () => {
  it('destructures selectedRows out of the rest element instead of relaying it to DataTable', () => {
    assert.ok(
      destructuredNames.includes('selectedRows'),
      `\`selectedRows\` must be pulled out of \`props\`, got: ${destructuredParams.join(', ')}`,
    );
    // Leaving it in the spread would hand DataTable a prop whose name is its own local
    // selection state, i.e. it reads as controlled selection that DataTable does not
    // implement. Passing it explicitly is the same bug spelled differently.
    assert.doesNotMatch(src, /selectedRows=\{/, 'selectedRows must not travel into DataTable');
  });

  /**
   * The trap this pins. Since ETP-5111 nothing in the body READS `selectedRows` — so it now looks
   * exactly like a leftover a tidy-up would delete, and deleting it is a silent bug: the prop falls
   * back into `...props`, reaches DataTable, and starts reading as a controlled-selection API that
   * DataTable does not implement. It is load-bearing precisely BECAUSE it is unused, which is what
   * the eslint-disable directive above it records. Keep the directive and the name together.
   */
  it('keeps the deliberately-unused selectedRows destructuring, marked as intentional', () => {
    assert.match(
      src,
      /eslint-disable-next-line no-unused-vars\s*\n\s*selectedRows,/,
      'selectedRows must stay destructured, with the directive that says the absence of a reader is intentional',
    );
  });

  it('keeps no local mirror of the selection', () => {
    // Selection state is ListView's. A local mirror fed by onSelectionChange goes stale anyway:
    // DataTable empties or prunes its internal Set from clearSelectionTrigger / deselectTrigger
    // WITHOUT calling onSelectionChange. Both names are mentioned in comments here, so match on
    // code only — same treatment as the retired-R-spec guard above.
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /onSelectionChange/);
    assert.doesNotMatch(code, /setSelectedRows/);
  });

  it('renders AccountsToolbar unconditionally, with no selection gate left', () => {
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    // The retired gate by name, so a straight revert of the JSX fails here.
    assert.doesNotMatch(code, /selectionActive/, 'the selection gate on the toolbar was retired');

    // And structurally, for any gate spelled differently: whatever immediately precedes
    // `<AccountsToolbar` must be a plain element open tag, never a condition. `&&` / `?` / `:`
    // in the JSX right above it is exactly what a re-introduced gate looks like.
    const at = code.indexOf('<AccountsToolbar');
    assert.ok(at > 0, 'the slot must render AccountsToolbar');
    const justBefore = code.slice(Math.max(0, at - 200), at);
    assert.match(justBefore, /<\w[^>]*>\s*$/, 'AccountsToolbar must be a direct child of an element');
    for (const gate of ['&&', '?', ' : ']) {
      assert.ok(
        !justBefore.includes(gate),
        `no conditional (${gate}) may gate AccountsToolbar, got: ${JSON.stringify(justBefore.slice(-120))}`,
      );
    }
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

// ETP-4871 — the same deleteTarget/onDelete/DeleteAccountDialog wiring index.jsx (the detail
// view) got, mirrored here for the list view. Behavioural coverage:
// tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable.handlers.vitest.jsx
describe('AccountsHeaderTable — delete wiring (ETP-4871)', () => {
  it('imports DeleteAccountDialog as a sibling of ArchiveAccountDialog', () => {
    assert.match(
      src,
      /import \{ DeleteAccountDialog \} from '@\/windows\/custom\/financial-account\/DeleteAccountDialog\.jsx'/,
    );
  });

  it('holds its own deleteTarget state, the same shape as archiveTarget', () => {
    assert.match(src, /const \[deleteTarget, setDeleteTarget\] = useState\(null\)/);
  });

  it('routes the row kebab\'s delete action to setDeleteTarget', () => {
    assert.match(src, /onDelete:\s*setDeleteTarget,/);
  });

  it('threads onDelete through the _rowActions column into AccountRowActions', () => {
    assert.match(src, /<AccountRowActions[\s\S]*?onDelete=\{handlers\.onDelete\}[\s\S]*?\/>/);
  });

  it('mounts DeleteAccountDialog gated by deleteTarget and refreshes the list on delete', () => {
    assert.match(src, /<DeleteAccountDialog\b/);
    assert.match(src, /open=\{!!deleteTarget\}/);
    assert.match(src, /account=\{deleteTarget\}/);
    assert.match(src, /onClose=\{\(\) => setDeleteTarget\(null\)\}/);
    // Both ArchiveAccountDialog and DeleteAccountDialog reuse the same `reload` (a thin
    // `onDataMutated?.()` wrapper) as their success callback.
    assert.match(src, /<DeleteAccountDialog[\s\S]*?onDeleted=\{reload\}/);
  });
});
