import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// This file imports live React/JSX modules ('@/components/ui/*', '@/i18n', '@/hooks/*')
// via aliases the Node test runner cannot resolve, and its default export is JSX — the
// whole module fails to parse under plain node:test. Same convention `BulkDocumentAction.test.js`
// already uses: source-reading regex assertions for the structural contract, plus a local,
// exact reimplementation of the pure logic (`isPosted`/`buildPostActions`) to test its
// behavior directly. Also: `.vitest.jsx` files placed anywhere under `artifacts/` are never
// collected by `npx vitest run` (rooted at `tools/app-shell/`, include glob is `src/**/*` only
// — see docs/feedback.md ETP-4841) or by `make test`'s `node --test 'artifacts/**/__tests__/*.test.js'`
// target either way, so a `.test.js` here is the only form that actually gates CI.
const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'MatchedInvoiceBulkActions.jsx'), 'utf8');

/**
 * Exact mirror of `isPosted`/`buildPostActions` from MatchedInvoiceBulkActions.jsx —
 * kept in sync via the source-reading assertions below, which pin the real file's
 * key lines so a source edit that changes this contract fails loudly here too.
 */
function isPosted(row) {
  return row.posted === 'Y' || row.posted === true;
}

function buildPostActions(rows) {
  const actions = [];
  if (rows.some((row) => !isPosted(row))) actions.push({ value: 'post', labelKey: 'post' });
  if (rows.some(isPosted)) actions.push({ value: 'unpost', labelKey: 'unpost' });
  return actions;
}

describe('MatchedInvoiceBulkActions source', () => {
  it('exports buildPostActions as a named export for testability', () => {
    assert.match(src, /export const buildPostActions/);
  });

  it('offers post when any row is not posted, unpost when any row is posted', () => {
    assert.match(src, /rows\.some\(\(row\)\s*=>\s*!isPosted\(row\)\)\)\s*actions\.push\(\{\s*value:\s*'post'/);
    assert.match(src, /rows\.some\(isPosted\)\)\s*actions\.push\(\{\s*value:\s*'unpost'/);
  });

  it('treats only Posted === "Y" (or boolean true) as posted', () => {
    assert.match(src, /row\.posted === 'Y' \|\| row\.posted === true/);
  });

  it('wires actionMode="neoAction" and entity="matchedInvoice" on BulkDocumentAction', () => {
    assert.match(src, /actionMode="neoAction"/);
    assert.match(src, /entity="matchedInvoice"/);
  });

  it('rowFilter pre-blocks post on an already-posted row and unpost on a not-posted row', () => {
    assert.match(src, /action === 'post' && isPosted\(row\)\) return ui\('bulkRowAlreadyPosted'\)/);
    assert.match(src, /action === 'unpost' && !isPosted\(row\)\) return ui\('bulkRowNotPosted'\)/);
  });
});

describe('buildPostActions', () => {
  it('all rows unposted (Y) ⇒ only the post action', () => {
    const rows = [{ posted: 'T' }, { posted: 'E' }];
    assert.deepEqual(buildPostActions(rows), [{ value: 'post', labelKey: 'post' }]);
  });

  it('all rows posted ⇒ only the unpost action', () => {
    const rows = [{ posted: 'Y' }, { posted: 'Y' }];
    assert.deepEqual(buildPostActions(rows), [{ value: 'unpost', labelKey: 'unpost' }]);
  });

  it('mixed selection ⇒ offers both post and unpost', () => {
    const rows = [{ posted: 'Y' }, { posted: 'T' }];
    assert.deepEqual(buildPostActions(rows), [
      { value: 'post', labelKey: 'post' },
      { value: 'unpost', labelKey: 'unpost' },
    ]);
  });

  it('empty selection ⇒ empty array', () => {
    assert.deepEqual(buildPostActions([]), []);
  });

  it('posted: true (boolean) counts as posted', () => {
    const rows = [{ posted: true }];
    assert.deepEqual(buildPostActions(rows), [{ value: 'unpost', labelKey: 'unpost' }]);
  });

  // M_MatchInv.Posted is NOT a boolean: live data holds Y, T, E, D, p, i (the AD
  // "Posted status" domain). Only 'Y' means posted — every other state (Error,
  // Period Closed, Invalid Account, Disabled, ...) must remain postable.
  for (const notPostedValue of ['T', 'E', 'D', 'p', 'i']) {
    it(`posted: '${notPostedValue}' counts as NOT posted (only 'Y' is posted)`, () => {
      const rows = [{ posted: notPostedValue }];
      assert.deepEqual(buildPostActions(rows), [{ value: 'post', labelKey: 'post' }]);
      assert.equal(isPosted(rows[0]), false);
    });
  }

  it('a single unposted row alongside a "Y" row still offers both actions (isPosted per-row, not majority)', () => {
    const rows = [{ posted: 'D' }, { posted: 'Y' }, { posted: 'p' }];
    const result = buildPostActions(rows);
    assert.equal(result.length, 2);
    assert.deepEqual(result.map((a) => a.value).sort(), ['post', 'unpost']);
  });
});
