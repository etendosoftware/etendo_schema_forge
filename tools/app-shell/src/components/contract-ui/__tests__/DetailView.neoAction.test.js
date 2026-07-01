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

  it('shows toast.error with result.message or ui(actionFailed) on failure', () => {
    assert.match(src, /toast\.error\(result\.message\s*\|\|\s*ui\(['"]actionFailed['"]\)\)/);
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
