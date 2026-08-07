import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

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
    assert.match(src, /if\s*\(action\.neoAction\)/);
  });

  it('calls neoAction.execute with the current id and action.neoAction', () => {
    assert.match(src, /neoAction\.execute\(currentId,\s*action\.neoAction\)/);
  });

  it('checks result.success (hook returns a result object, does not throw)', () => {
    assert.match(src, /if\s*\(result\.success\)/);
  });

  it('refreshes the record via hook.fetchById on success', () => {
    assert.match(src, /result\.success[\s\S]{0,350}hook\.fetchById\?\.\(currentId\)/);
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
    assert.match(src, /disabled=\{docAction\.loading\s*\|\|\s*neoAction\.loading\}/);
  });

  it('OR-s neoAction.loading into the loading className guard', () => {
    assert.match(src, /docAction\.loading\s*\|\|\s*neoAction\.loading\s*\?\s*'opacity-50 cursor-not-allowed'/);
  });

  it('emits a stable menu-action-<key> data-testid consistent with RowQuickActions', () => {
    assert.match(src, /data-testid=\{`menu-action-\$\{action\.key\s*\|\|\s*i\}`\}/);
  });
});
