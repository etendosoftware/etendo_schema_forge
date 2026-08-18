import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');
// The kebab menu's action handlers moved verbatim to DetailMoreActionsMenu.jsx.
// Assertions below that target that block read from there; nothing was relaxed.
const menuSrc = readFileSync(join(__dirname, '..', 'DetailMoreActionsMenu.jsx'), 'utf8');

/**
 * Regression guard for ETP-3846:
 * Menu actions with `documentAction` must emit a `sonner` toast on success/failure
 * instead of an inline banner driven by `actionFeedback` state.
 *
 * Replacing the inline banner with a toast keeps the UX consistent with other
 * transient notifications (save errors, delete feedback) and gives more
 * context by using the window-specific `successKey` declared in decisions.json.
 */
describe('DetailView — documentAction toast feedback (ETP-3846 regression)', () => {
  it('calls toast.success on documentAction success', () => {
    assert.match(src, /toast\.success\(/);
  });

  it('resolves the success message from action.successKey via ui()', () => {
    assert.match(menuSrc, /action\.successKey\s*\?\s*ui\(\s*action\.successKey\s*\)/);
  });

  it('falls back to action.successMessage when successKey is absent', () => {
    assert.match(menuSrc, /action\.successMessage/);
  });

  it('falls back to ui(actionCompleted) when neither successKey nor successMessage is present', () => {
    assert.match(menuSrc, /ui\(['"]actionCompleted['"]\)/);
  });

  it('calls toast.error on documentAction failure', () => {
    assert.match(src, /toast\.error\(/);
  });

  it('does not use actionFeedback state (inline banner removed)', () => {
    assert.doesNotMatch(src, /actionFeedback/);
  });

  it('does not render an inline banner div for menu action results', () => {
    assert.doesNotMatch(src, /Menu action feedback.*from documentAction/);
  });
});
