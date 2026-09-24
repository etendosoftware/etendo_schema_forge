import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');
// The kebab menu's onClick/handler block moved verbatim to DetailMoreActionsMenu.jsx.
// Assertions targeting that block read from there; no regex was relaxed.
const menuSrc = readFileSync(join(__dirname, '..', 'DetailMoreActionsMenu.jsx'), 'utf8');

// Comment-stripped view of the menu source, mirroring the idiom already used by
// sessionContractInvariants.test.js / SendDocumentModal.test.js. Structural
// assertions must read this, never `menuSrc`: prose inside an explanatory comment
// is not code, and — more to the point — it must not be able to push two real
// statements apart far enough to break an assertion about them. The `(^|[^:])`
// guard keeps `https://` from being mistaken for a line comment.
const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const menuCode = stripComments(menuSrc);

/**
 * Returns the brace-balanced block that starts at the first `{` at or after
 * `fromIndex`. Fails loudly rather than returning a partial slice, so a renamed
 * or deleted target surfaces as an explicit failure instead of a silent pass.
 */
function blockFrom(code, fromIndex, label) {
  const open = code.indexOf('{', fromIndex);
  assert.ok(open >= 0, `${label}: no block found`);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  assert.fail(`${label}: unbalanced braces`);
  return '';
}

/** Body of a `const <name> = async (...) => { ... }` declaration. */
function functionBody(code, name) {
  const start = code.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `${name}: declaration not found`);
  return blockFrom(code, start, name);
}

/** The consequent block of the `if (<condition>)` inside `body`. */
function branchOf(body, condition, label) {
  const at = body.indexOf(`if (${condition})`);
  assert.ok(at >= 0, `${label}: expected an \`if (${condition})\` branch`);
  return blockFrom(body, at, label);
}

/**
 * Asserts `before` precedes `after` inside `code`. Both must actually be present:
 * `indexOf` returns -1 for a missing needle and `-1 < n` is true, so an unguarded
 * comparison passes exactly when the statement it guards has been deleted.
 */
function assertOrder(code, before, after, label) {
  const i = code.indexOf(before);
  const j = code.indexOf(after);
  assert.ok(i >= 0, `${label}: expected to find \`${before}\``);
  assert.ok(j >= 0, `${label}: expected to find \`${after}\``);
  assert.ok(i < j, `${label}: expected \`${before}\` to precede \`${after}\``);
}

/**
 * Regression guard for ETP-4298:
 * The detail-view "more" menu has its own action handler, separate from
 * RowQuickActions. It already handled `documentAction`, but NOT `neoAction`,
 * so the document detail-view Post/Unpost button (a NEO custom action) did
 * not fire. This guard ensures the `neoAction` branch is wired through the
 * shared `useNeoAction` hook and produces toast feedback + a refresh.
 */
describe('DetailView — neoAction menu branch (ETP-4298)', () => {
  it('imports the useNeoAction hook', () => {
    assert.match(src, /import\s*\{\s*useNeoAction\s*\}\s*from\s*'@\/hooks\/useNeoAction'/);
  });

  it('instantiates useNeoAction with specName=windowName and the same entity docAction uses', () => {
    assert.match(
      src,
      /const\s+neoAction\s*=\s*useNeoAction\(\{\s*specName:\s*windowName,\s*entityName:\s*entity,\s*apiBaseUrl,\s*token\s*\}\)/,
    );
  });

  it('handles the action.neoAction branch in the menu onClick', () => {
    assert.match(menuCode, /if\s*\(action\.neoAction\)/);
  });

  it('calls neoAction.execute with the current id and action.neoAction', () => {
    assert.match(menuCode, /neoAction\.execute\(currentId,\s*action\.neoAction\)/);
  });

  it('checks result.success (hook returns a result object, does not throw)', () => {
    assert.match(src, /if\s*\(result\.success\)/);
  });

  it('refreshes the record via hook.fetchById on success', () => {
    // ETP-4563 cache fix: the post-neoAction refresh forces a fresh network read.
    //
    // ETP-5378 — this was `result.success[\s\S]{0,350}hook.fetchById...`: a
    // character-proximity budget standing in for "the refetch is in the success
    // branch". That is not what the assertion means, and the budget is a trap —
    // adding an explanatory comment (or one more statement) between the two ends
    // pushes them apart and fails a source that is entirely correct, which is
    // exactly what happened here. Raising 350 to a larger number only moves the
    // trap. Assert the structure instead: extract the success branch and look
    // inside it.
    const branch = branchOf(functionBody(menuCode, 'runNeoMenuAction'), 'result.success', 'runNeoMenuAction');
    assert.match(branch, /hook\.fetchById\?\.\(currentId, \{ force: true \}\)/);
    assert.match(branch, /toast\.success\(msg\)/);
  });

  it('invalidates the list cache before the forced record refetch on success (ETP-5378)', () => {
    // The grid page was cached with the pre-action row, so navigating back showed
    // a stale status. Order matters: the invalidation must precede the refetch.
    const branch = branchOf(functionBody(menuCode, 'runNeoMenuAction'), 'result.success', 'runNeoMenuAction');
    assertOrder(
      branch,
      'hook.invalidateEntityCache?.()',
      'hook.fetchById?.(currentId, { force: true })',
      'runNeoMenuAction success branch',
    );
  });

  it('applies the same invalidate-then-refetch order in runDocumentAction (ETP-5378)', () => {
    // Sibling handler, same cache contract — guarded structurally for the same
    // reason, so a future comment between the calls cannot break it.
    const body = functionBody(menuCode, 'runDocumentAction');
    assertOrder(
      body,
      'hook.invalidateEntityCache?.()',
      'hook.fetchById?.(currentId, { force: true })',
      'runDocumentAction',
    );
  });

  it('shows toast.error with the (translated) result.message or ui(actionFailed) on failure (ETP-4706)', () => {
    // The message is passed through translateBackendError before falling back to the
    // generic actionFailed label, so backend errors with a known translation (e.g. the
    // "Account could not be found. (Business Partner: ...)" enrichment) render localized.
    assert.match(
      src,
      /toast\.error\(translateBackendError\(result\.message,\s*ui\)\s*\|\|\s*ui\(['"]actionFailed['"]\)\)/,
    );
  });

  it('imports translateBackendError from @/lib/backendErrors.js', () => {
    assert.match(src, /import\s*\{\s*translateBackendError\s*\}\s*from\s*'@\/lib\/backendErrors\.js'/);
  });

  it('disables the menu button while either docAction or neoAction is loading', () => {
    assert.match(menuCode, /disabled=\{docAction\.loading\s*\|\|\s*neoAction\.loading\}/);
  });

  it('OR-s neoAction.loading into the loading className guard', () => {
    assert.match(menuCode, /docAction\.loading\s*\|\|\s*neoAction\.loading\s*\?\s*'opacity-50 cursor-not-allowed'/);
  });

  it('emits a stable menu-action-<key> data-testid consistent with RowQuickActions', () => {
    assert.match(menuCode, /data-testid=\{`menu-action-\$\{action\.key\s*\|\|\s*i\}`\}/);
  });
});
