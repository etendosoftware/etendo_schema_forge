import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source-shape tests for the ETP-4886 "Enter exits inline-edit mode" fix.
 *
 * Before this fix, pressing Enter while editing an inline line cell saved the
 * value (via the Input's own onKeyDown → blur() → commitField chain) but left
 * the row stuck in edit mode — nothing else called setEditingRowId(null) on
 * Enter (only the click-outside effect and Escape did).
 *
 * `isEnterExitTarget` and `makeRowKeyHandler` are internal (not exported) —
 * their contract is documented here via source-shape assertions; runtime
 * behavior (does the row actually close?) is covered by RTL tests in
 * InlineLinesPanel.vitest.jsx ("Enter-to-exit edit mode (ETP-4886)") and by
 * inline-lines-behavior.mocked.spec.js / inline-lines-min-value.mocked.spec.js
 * in the browser.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InlineLinesPanel.jsx'), 'utf8');

describe('InlineLinesPanel — Enter-to-exit edit mode (ETP-4886)', () => {
  it('declares the DIMENSIONS_PANEL_SELECTOR constant scoped to the dimensions sub-row testid', () => {
    assert.match(src, /const DIMENSIONS_PANEL_SELECTOR = '\[data-testid\^="dimensions-panel-"\]';/);
  });

  it('declares the isEnterExitTarget helper', () => {
    assert.match(src, /function isEnterExitTarget\(target\)/);
  });

  it('isEnterExitTarget only considers INPUT elements eligible', () => {
    // Every non-text control in this table (Select trigger, PillToggle, LookupTrigger)
    // renders as a <button>, so gating on tagName === 'INPUT' excludes them all without
    // needing per-control checks.
    assert.match(src, /if \(!target \|\| target\.tagName !== 'INPUT'\) return false;/);
  });

  it('isEnterExitTarget excludes checkbox-type inputs', () => {
    assert.match(src, /if \(target\.type === 'checkbox'\) return false;/);
  });

  it('isEnterExitTarget excludes inputs nested inside the dimensions sub-row', () => {
    assert.match(src, /return !target\.closest\?\.\(DIMENSIONS_PANEL_SELECTOR\);/);
  });

  it('declares the makeRowKeyHandler helper with an onConfirmEdit callback', () => {
    assert.match(src, /function makeRowKeyHandler\(isEditing, onCancelEdit, onConfirmEdit\)/);
  });

  it('makeRowKeyHandler returns undefined when the row is not editing (no listener attached)', () => {
    assert.match(src, /if \(!isEditing\) return undefined;/);
  });

  it('makeRowKeyHandler still cancels on Escape before evaluating Enter', () => {
    const handler = src.match(/function makeRowKeyHandler[\s\S]*?\n\}/);
    assert.ok(handler, 'makeRowKeyHandler body not found');
    const escapeIdx = handler[0].indexOf("e.key === 'Escape'");
    const enterIdx = handler[0].indexOf("e.key === 'Enter'");
    assert.ok(escapeIdx > -1, 'Escape branch missing');
    assert.ok(enterIdx > -1, 'Enter branch missing');
    assert.ok(escapeIdx < enterIdx, 'Escape must be checked before Enter');
    assert.match(handler[0], /onCancelEdit\(\);\s*\n\s*return;/);
  });

  it('makeRowKeyHandler only confirms on Enter when isEnterExitTarget(e.target) is true', () => {
    assert.match(
      src,
      /if \(e\.key === 'Enter' && isEnterExitTarget\(e\.target\)\) \{\s*\n\s*onConfirmEdit\(\);\s*\n\s*\}/,
    );
  });

  it('does NOT call preventDefault on the Enter branch (the Input already committed via blur)', () => {
    const enterBranch = src.match(/if \(e\.key === 'Enter' && isEnterExitTarget\(e\.target\)\) \{[\s\S]*?\}/);
    assert.ok(enterBranch, 'Enter branch not found');
    assert.doesNotMatch(enterBranch[0], /preventDefault/);
  });

  it('declares handleConfirmEdit as the Enter sibling of handleCancelEdit', () => {
    assert.match(src, /const handleConfirmEdit = useCallback\(\(\) => \{/);
  });

  it('handleConfirmEdit defers to the next tick and bails when a validation error is pending', () => {
    const block = src.match(/const handleConfirmEdit = useCallback\([\s\S]*?\}, \[\]\);/);
    assert.ok(block, 'handleConfirmEdit block not found');
    assert.match(block[0], /setTimeout\(\(\) => \{/);
    assert.match(block[0], /if \(hasValidationErrorRef\.current\) return;/);
    assert.match(block[0], /setEditingRowId\(null\);/);
  });

  it('wires makeRowKeyHandler with handleConfirmEdit on the row onKeyDown (replacing the old Escape-only handler)', () => {
    assert.match(
      src,
      /onKeyDown=\{makeRowKeyHandler\(isEditing, handleCancelEdit, handleConfirmEdit\)\}/,
    );
    // The old two-arg makeRowEscapeHandler wiring must be gone, not just renamed.
    assert.doesNotMatch(src, /makeRowEscapeHandler/);
  });
});
