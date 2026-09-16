import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

/**
 * ETP-5199 — regression guard for the "Guardar y salir" (in-app unsaved-changes
 * navigation guard) save path silently dropping onAfterCreate/onAfterExistingSave.
 *
 * Before the fix, `useUnsavedChangesGuard` was registered with a bare inline arrow —
 * `() => hook.handleSave({ silent: true })` — that called ONLY `handleSave` and never
 * ran the window's post-save hook. The toolbar Save button never had this gap because
 * its own onClick always chains `handlePostSaveNavigation` (which does call the hook via
 * `runAfterSaveHook`), but the unsaved-changes-guard path bypassed that entirely.
 *
 * `runAfterSaveHook`/`buildUnsavedChangesSaver` themselves are covered directly (with
 * mocked `hook`/`onAfterCreate`/`onAfterExistingSave`) in
 * `DetailView.saveActions.vitest.jsx`. This file is source-reading, per this
 * component's own no-growth guardrail (.claude/hooks/check-detailview-growth.mjs) and
 * this repo's existing convention for DetailView.jsx (see DetailView.dirtyState.test.js)
 * — it proves the WIRING itself: that DetailView.jsx actually passes
 * `buildUnsavedChangesSaver(...)`, not the old inline arrow, into
 * `useUnsavedChangesGuard`. Nothing else in the suite would catch a regression where
 * someone reverts just this one call site back to the old arrow while leaving
 * `buildUnsavedChangesSaver` itself intact and fully tested (its unit tests would still
 * pass — they don't know whether DetailView.jsx actually calls them).
 */
describe('DetailView — useUnsavedChangesGuard wiring (ETP-5199)', () => {
  it('imports buildUnsavedChangesSaver from saveActions.jsx', () => {
    assert.match(
      src,
      /import\s*\{[^}]*buildUnsavedChangesSaver[^}]*\}\s*from\s*'\.\/saveActions\.jsx'/,
    );
  });

  it('registers useUnsavedChangesGuard with buildUnsavedChangesSaver(...), passing hook/isNew/onAfterCreate/onAfterExistingSave/token/apiBaseUrl/ui', () => {
    assert.match(
      src,
      /useUnsavedChangesGuard\(\s*isDirty,\s*buildUnsavedChangesSaver\(\s*\{\s*hook,\s*isNew,\s*onAfterCreate,\s*onAfterExistingSave,\s*token,\s*apiBaseUrl,\s*ui\s*\}\s*\)\s*\)/,
    );
  });

  it('does NOT register the old bare-handleSave arrow any more (the exact bug shape)', () => {
    assert.doesNotMatch(
      src,
      /useUnsavedChangesGuard\(\s*isDirty,\s*\(\)\s*=>\s*hook\.handleSave\(\s*\{\s*silent:\s*true\s*\}\s*\)\s*\)/,
    );
  });

  it('declares `isNew` before the useUnsavedChangesGuard call site (no temporal-dead-zone crash)', () => {
    const isNewIdx = src.search(/const\s+isNew\s*=\s*recordId\s*===\s*'new'/);
    const guardIdx = src.indexOf('useUnsavedChangesGuard(isDirty, buildUnsavedChangesSaver(');
    assert.notEqual(isNewIdx, -1, 'expected to find the isNew declaration');
    assert.notEqual(guardIdx, -1, 'expected to find the useUnsavedChangesGuard call site');
    assert.ok(isNewIdx < guardIdx, 'isNew must be declared before it is read by the guard registration');
  });

  it('declares `isNew` exactly once (the old, later duplicate declaration was removed, not shadowed)', () => {
    const matches = src.match(/const\s+isNew\s*=\s*recordId\s*===\s*'new'/g) || [];
    assert.equal(matches.length, 1, `expected exactly one isNew declaration, found ${matches.length}`);
  });
});
