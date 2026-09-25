import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'BulkDocumentAction.jsx'), 'utf8');

function buildInOutActions(rows) {
  const hasDraft = rows.some((r) => (r.documentStatus || r.docStatus) === 'DR');
  return hasDraft ? [{ value: 'CO', labelKey: 'confirm' }] : [];
}

describe('BulkDocumentAction source', () => {
  it('exports buildInOutActions as named export', () => {
    assert.match(src, /export const buildInOutActions/);
  });

  it('exports BulkDocumentAction as default component', () => {
    assert.match(src, /export default function BulkDocumentAction/);
  });

  it('defaults entity prop to header', () => {
    assert.match(src, /entity\s*=\s*['"]header['"]/);
  });

  // ETP-5302 — this is the FALLBACK path (no `refresh` prop), not the main one.
  // The raw `sessionStorage.setItem` write moved out of this component and into
  // `persistBulkActionResult` (useBulkActionToast.js), so the storage key and the
  // persisted shape live in exactly one place.
  it('fallback path: persists the result through persistBulkActionResult before the reload', () => {
    assert.match(src, /persistBulkActionResult\(result\)/);
    assert.doesNotMatch(src, /sessionStorage\.setItem/);
  });

  it('returns null when no rows are selected', () => {
    assert.match(src, /selectedRows\.length === 0/);
  });

  it('returns null when no actions are available', () => {
    assert.match(src, /actions\.length === 0/);
  });

  // ETP-5302 — the local buildInOutActions above is a hand-kept copy, so it can
  // never catch a drift in the real module on its own. These source assertions
  // are the ones that actually fail if the CO option regresses to the `book`
  // key (which renders "Procesar" in es_ES — the same word as the button that
  // opens the dialog, since every call site now passes labelKey="process").
  it('labels every CO (complete) action with the confirm key, never book', () => {
    assert.doesNotMatch(src, /labelKey:\s*'book'/);
    const coActions = src.match(/value:\s*'CO',\s*labelKey:\s*'confirm'/g) || [];
    // Two producers: the exported buildInOutActions helper and the component's
    // own built-in useMemo fallback (used when no buildActions prop is passed).
    assert.equal(coActions.length, 2);
  });

  it('leaves the RE (reactivate) action on the reactivate key', () => {
    assert.match(src, /value:\s*'RE',\s*labelKey:\s*'reactivate'/);
  });

  it('keeps bulkCompletion as the default labelKey for the trigger button', () => {
    assert.match(src, /labelKey\s*=\s*'bulkCompletion'/);
  });

  it('uses Promise.allSettled to process rows in parallel', () => {
    assert.match(src, /Promise\.allSettled/);
  });

  // ETP-5302 — also the FALLBACK path. The full browser reload survives ONLY for a
  // host that mounts this component outside ListView's `bulkActions` slot (and so
  // cannot hand it a `refresh`); the primary path below never reloads.
  it('fallback path: clears the selection and reloads the page after execution', () => {
    assert.match(src, /clearSelection\(\)/);
    assert.match(src, /window\.location\.reload/);
  });
});

// ETP-5302 — the bug: running a bulk action did a FULL browser reload. The reload
// was never about the data — it was how the result toast survived, since it was
// persisted to sessionStorage and read back by `useBulkActionToast`'s mount effect.
// With an in-place `refresh` from ListView's slot, the toast can be shown directly
// and the reload (plus the lost scroll position, filters and SPA boot) disappears.
describe('BulkDocumentAction — in-place refresh path (ETP-5302)', () => {
  it('declares the refresh prop supplied by ListView bulkActions slot', () => {
    assert.match(src, /export default function BulkDocumentAction\(\{[\s\S]*?\brefresh,[\s\S]*?\}\)/);
  });

  it('clears the selection, shows the toast and refetches when refresh is available', () => {
    assert.match(
      src,
      /if \(refresh\) \{[\s\S]*?clearSelection\(\);[\s\S]*?showBulkActionToast\(ui, result\);[\s\S]*?refresh\(\);[\s\S]*?return;[\s\S]*?\}/,
    );
  });

  it('returns before the legacy persist + reload branch', () => {
    const refreshBranch = src.indexOf('if (refresh)');
    const persist = src.indexOf('persistBulkActionResult(result)');
    assert.ok(refreshBranch > -1 && persist > -1);
    assert.ok(refreshBranch < persist, 'the refresh branch must short-circuit before the fallback');
    // Nothing in the refresh branch may persist, defer or reload.
    const branch = src.slice(refreshBranch, persist);
    assert.doesNotMatch(branch, /sessionStorage/);
    assert.doesNotMatch(branch, /setTimeout/);
    assert.doesNotMatch(branch, /location\.reload/);
  });

  it('keeps exactly one reload call site (the fallback)', () => {
    const reloads = src.match(/window\.location\.reload\(\)/g) || [];
    assert.equal(reloads.length, 1);
  });

  // Regression guard for a fix that was tried and reverted: reaching `showResult`
  // by mounting `useBulkActionToast()` inside this component also installs the
  // hook's sessionStorage-DRAINING effect, which re-runs on every `ui` identity
  // change and eats the component's own persisted result before the fallback
  // reload can hand it to the next mount. The pure exported function has no effect.
  it('imports the pure showBulkActionToast helper and never mounts the hook itself', () => {
    assert.match(src, /import \{[^}]*showBulkActionToast[^}]*\} from '@\/hooks\/useBulkActionToast'/);
    assert.doesNotMatch(src, /useBulkActionToast\(\)/);
  });
});

describe('buildInOutActions', () => {
  it('returns CO action when at least one row is DR', () => {
    const result = buildInOutActions([{ documentStatus: 'DR' }, { documentStatus: 'CO' }]);
    assert.deepEqual(result, [{ value: 'CO', labelKey: 'confirm' }]);
  });

  it('returns empty array when no rows are DR', () => {
    const result = buildInOutActions([{ documentStatus: 'CO' }, { documentStatus: 'CL' }]);
    assert.deepEqual(result, []);
  });

  it('reads docStatus as fallback when documentStatus is absent', () => {
    const result = buildInOutActions([{ docStatus: 'DR' }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].value, 'CO');
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(buildInOutActions([]), []);
  });

  it('single DR row triggers the action', () => {
    assert.deepEqual(buildInOutActions([{ documentStatus: 'DR' }]), [{ value: 'CO', labelKey: 'confirm' }]);
  });
});

// ── ETP-5302 — bulk "Descontabilizar" (unpost) ────────────────────────────────
// A pair of exports SEPARATE from buildPostActions/postRowFilter, because the
// windows that may offer a standalone unpost are not the ones that may offer a
// post: goods-receipt/goods-shipment mount both, the invoice windows mount only
// post (there, the accounting reversal is a step inside Reactivar).
describe('BulkDocumentAction — unpost helpers (ETP-5302)', () => {
  it('exports buildUnpostActions and unpostRowFilter as named exports', () => {
    assert.match(src, /export const buildUnpostActions/);
    assert.match(src, /export const unpostRowFilter/);
  });

  it('keeps them separate from the post pair (four distinct exported helpers)', () => {
    assert.match(src, /export const buildPostActions/);
    assert.match(src, /export const postRowFilter/);
    // A single merged helper taking a direction argument would defeat the
    // per-window opt-in this pair exists for.
    assert.doesNotMatch(src, /export const buildPostOrUnpostActions/);
  });

  it('offers the unpost action only when a selected row is posted', () => {
    assert.match(src, /buildUnpostActions\s*=\s*\(rows\)\s*=>[\s\S]*?rows\.some\(isRowPosted\)/);
    assert.match(src, /value:\s*'unpost',\s*labelKey:\s*'unpost'/);
  });

  it('blocks a not-posted row with the bulkRowNotPosted message and gates on the action', () => {
    assert.match(src, /unpostRowFilter\s*=\s*\(row,\s*action,\s*ui\)/);
    assert.match(src, /action\s*!==\s*'unpost'[\s\S]*?return true/);
    assert.match(src, /ui\('bulkRowNotPosted'\)/);
  });
});

// ── ETP-5302 — preUnpostActions (the reactivate-a-posted-invoice bug) ─────────
describe('BulkDocumentAction — preUnpostActions prop (ETP-5302)', () => {
  it('declares preUnpostActions with an empty-array default (opt-in per window)', () => {
    assert.match(src, /preUnpostActions\s*=\s*\[\]/);
  });

  it('delegates to the shared runPreUnpost helper instead of re-implementing the rule', () => {
    assert.match(src, /import \{ runPreUnpost \} from '@\/lib\/preUnpost\.js'/);
    assert.match(src, /runPreUnpost\(\{[\s\S]*?enabled: preUnpostActions\.includes\(selectedAction\)/);
    // The posted check belongs to the helper — a second copy here is how the
    // detail kebab and the bulk bar drifted apart in the first place.
    assert.doesNotMatch(src, /enabled:[\s\S]{0,120}row\.posted/);
  });

  it('runs the unpost through the neoAction executor, whatever the actionMode is', () => {
    assert.match(src, /runPreUnpost\(\{[\s\S]*?execute: neoAction\.execute/);
  });

  it('aborts the row with a translated message when the pre-unpost fails', () => {
    assert.match(
      src,
      /if \(!pre\.success\) \{[\s\S]*?throw new Error\(translateBackendError\(pre\.message, ui\) \|\| ui\('actionFailed'\)\)/,
    );
    assert.match(src, /import \{ translateBackendError \} from '@\/lib\/backendErrors\.js'/);
  });

  it('awaits the pre-unpost BEFORE executing the document action', () => {
    // Search for the closing `Promise.allSettled` FROM the start of runRow: the string
    // also appears earlier in the ETP-5209 comment block, and anchoring at index 0
    // sliced backwards and produced an empty body.
    const start = src.indexOf('const runRow');
    const runRow = src.slice(start, src.indexOf('Promise.allSettled', start));
    const pre = runRow.indexOf('runPreUnpost');
    // ETP-5414 — `execute` now receives `wireActionName` (the resolved wire name), not the
    // raw `selectedAction` (the dropdown's INTENT value) — see the `neoActionName` describe
    // block below for why the two can differ.
    // ETP-5445 — the call is now `await (wireActionBody === undefined ? execute(row.id,
    // wireActionName) : execute(row.id, wireActionName, wireActionBody))`; anchor on the
    // two-arg form, which is the first `execute(` inside the awaited expression.
    const exec = runRow.indexOf('execute(row.id, wireActionName)');
    assert.ok(pre > -1 && exec > -1, 'runRow must contain both steps');
    assert.ok(pre < exec, 'the pre-unpost must be awaited before the document action');
  });

  // ETP-5414 — `wireActionName` is the escape hatch that lets a caller's dropdown `value`
  // (the user's intent) diverge from the actual NEO action name `execute()` calls. Every
  // existing caller relies on the fallback (`?? selectedAction`), so this is a source-level
  // guard that the fallback expression itself is still there, verbatim.
  it('resolves wireActionName from the selected action\'s neoActionName, defaulting to selectedAction itself', () => {
    // ETP-5445 — the lookup was split into `selectedActionDef` so `neoActionBody` can be
    // read from the same action definition.
    assert.match(
      src,
      /const selectedActionDef = actions\.find\(\(a\) => a\.value === selectedAction\);/,
    );
    assert.match(
      src,
      /const wireActionName = selectedActionDef\?\.neoActionName \?\? selectedAction;/,
    );
  });

  // ETP-5445 — `neoActionBody` is read only in neoAction mode; documentAction's third
  // parameter is an unrelated options bag and must never receive it.
  it('reads neoActionBody only in neoAction mode', () => {
    assert.match(
      src,
      /const wireActionBody = actionMode === 'neoAction' \? selectedActionDef\?\.neoActionBody : undefined;/,
    );
  });

  it('keeps execute at two args when there is no body', () => {
    assert.match(
      src,
      /wireActionBody === undefined\s*\?\s*execute\(row\.id, wireActionName\)\s*:\s*execute\(row\.id, wireActionName, wireActionBody\)/,
    );
  });
});

// ── ETP-5302 — per-window wiring, asserted at the call sites ──────────────────
// `preUnpostActions` is opt-in ON PURPOSE. Invoices need it (C_INVOICE_POST raises
// @InvoiceDocumentPosted@ on an RE while Posted='Y'); ORDERS MUST NOT HAVE IT —
// C_ORDER_POST1's RE branch has no Posted guard, so unposting there would be a
// gratuitous accounting reversal nobody asked for. Same for the shipment/receipt
// windows. These guards are cheap and catch a copy-paste that would be invisible
// in any per-window render test.
describe('preUnpostActions call sites (ETP-5302)', () => {
  const read = (...parts) => readFileSync(join(__dirname, '..', '..', '..', ...parts), 'utf8');
  const readArtifact = (...parts) =>
    readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', 'artifacts', ...parts), 'utf8');

  const OPTED_IN = ['sales-invoice', 'purchase-invoice'];
  const NOT_OPTED_IN = ['goods-shipment', 'goods-receipt', 'purchase-order'];

  for (const window of OPTED_IN) {
    it(`${window} passes preUnpostActions={['RE']} to its bulk process action`, () => {
      assert.match(read('windows', 'custom', window, 'index.jsx'), /preUnpostActions=\{\['RE'\]\}/);
    });
  }

  for (const window of NOT_OPTED_IN) {
    it(`${window} does NOT pass preUnpostActions (no accounting reversal on its bulk actions)`, () => {
      assert.doesNotMatch(read('windows', 'custom', window, 'index.jsx'), /preUnpostActions/);
    });
  }

  it('the sales-order bulk reactivate does NOT pass preUnpostActions', () => {
    // sales-order mounts BulkDocumentAction through this artifact wrapper, not its
    // own index.jsx — C_ORDER_POST1 has no Posted guard on the RE branch.
    assert.doesNotMatch(
      readArtifact('sales-order', 'custom', 'OrderReactivateBulkAction.jsx'),
      /preUnpostActions/,
    );
  });
});

// ── ETP-5302 — bulk unpost is mounted only where it is a legitimate action ────
describe('bulk unpost call sites (ETP-5302)', () => {
  const read = (window) =>
    readFileSync(join(__dirname, '..', '..', '..', 'windows', 'custom', window, 'index.jsx'), 'utf8');

  // ETP-5378 QA follow-up (SEL-05/SEL-06) added the two return windows to this list. They
  // belong here for the same reason the two goods windows do: their row-hover kebab already
  // exposed "Descontabilizar" (via buildDocumentRowQuickActionsPostMenu({ includeUnpost: true })
  // in ReturnWindowShell), so the selection bar lacking it was a grid-vs-selection asymmetry
  // — a posted row showed the action on hover and offered nothing at all once ticked.
  for (const window of ['goods-shipment', 'goods-receipt', 'return-material-receipt', 'return-to-vendor-shipment']) {
    it(`${window} mounts a third BulkDocumentAction wired to the shared unpost helpers`, () => {
      const source = read(window);
      assert.match(source, /import BulkDocumentAction, \{[^}]*buildUnpostActions[^}]*unpostRowFilter[^}]*\}/);
      assert.match(
        source,
        /<BulkDocumentAction[\s\S]*?actionMode="neoAction"[\s\S]*?buildActions=\{buildUnpostActions\}[\s\S]*?rowFilter=\{unpostRowFilter\}[\s\S]*?labelKey="unpost"/,
      );
    });
  }

  // PRODUCT RULE, not an implementation detail: on an invoice, reversing the
  // accounting is a step INSIDE Reactivar (preUnpostActions above) and is never
  // offered as an action of its own. A standalone "Descontabilizar" button would
  // let a user unpost a completed invoice and leave it in a state Reactivar is
  // supposed to own.
  for (const window of ['sales-invoice', 'purchase-invoice']) {
    it(`${window} mounts NO standalone bulk unpost button`, () => {
      const source = read(window);
      assert.doesNotMatch(source, /labelKey="unpost"/);
      assert.doesNotMatch(source, /buildUnpostActions/);
      assert.doesNotMatch(source, /unpostRowFilter/);
    });
  }
});

// ── ETP-5302 — the dialog's confirm button says "Aceptar", not "Completado" ───
// `done` resolves to "Completado" in es_ES — the name of a document STATUS — so on a
// dialog about document ACTIONS the button read as a promise to mark the selection
// as completed. It now uses `accept` ("Aceptar" / "Accept"). `done` itself is NOT
// retired: RecordCreateModal still uses it, which is why this guard is scoped to
// this component's footer.
describe('BulkDocumentAction — confirm button label (ETP-5302)', () => {
  it('confirms with the accept key and no longer with done', () => {
    assert.match(src, /\{ui\('accept'\)\}/);
    assert.doesNotMatch(src, /\{ui\('done'\)\}/);
  });

  it('keeps the cancel button untouched alongside it', () => {
    assert.match(src, /\{ui\('cancel'\)\}/);
  });

  it('ships the accept label in every locale, next to cancel', () => {
    const localesDir = join(__dirname, '..', '..', '..', 'locales');
    for (const locale of ['en_US', 'es_ES', 'es_AR']) {
      const labels = JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')).genericLabels;
      assert.ok(labels.accept, `${locale} is missing genericLabels.accept`);
      assert.ok(labels.cancel, `${locale} is missing genericLabels.cancel`);
      // `done` must survive: RecordCreateModal still renders it.
      assert.ok(labels.done, `${locale} lost genericLabels.done, still used by RecordCreateModal`);
    }
  });
});
