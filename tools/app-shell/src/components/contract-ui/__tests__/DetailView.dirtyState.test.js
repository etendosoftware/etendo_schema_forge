import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

/**
 * Regression guard for the dirty-state Save button feature added in ETP-3662.
 *
 * The Save button (and Save Draft in draftMode) must be disabled when there
 * are no pending unsaved changes. The Confirm button must never be gated by
 * dirty state. New records must always have Save active.
 */
describe('DetailView — isDirty composite expression (ETP-3662)', () => {
  it('computes isDirty from isDirtyHeader', () => {
    assert.match(src, /hook\.isDirtyHeader/);
  });

  it('includes addingLine as a dirty source', () => {
    assert.match(src, /\|\|\s*addingLine\b/);
  });

  it('includes addingSecondaryLine as a dirty source', () => {
    assert.match(src, /Object\.values\(addingSecondaryLine\)\.some\(Boolean\)/);
  });

  it('includes open sidebar line edits as a dirty source', () => {
    assert.match(src, /lineEdits\s*!=\s*null/);
    assert.match(src, /Object\.keys\(lineEdits\)\.length\s*>\s*0/);
  });

  it('includes additionalDirtyState as a dirty source', () => {
    assert.match(src, /additionalDirtyState\s*===\s*true/);
  });
});

describe('DetailView — additionalDirtyState extension prop', () => {
  it('declares additionalDirtyState prop with a default of false', () => {
    assert.match(src, /additionalDirtyState\s*=\s*false/);
  });
});

describe('DetailView — Save button disabled conditions (ETP-3662)', () => {
  it('gates the draftMode Save Draft button with !isDirty AND blockSaveForBalance', () => {
    // action-save-draft is the Save Draft button in draftMode windows. It checks
    // isSaving, !isDirty, AND blockSaveForBalance (ETP-4244 balance footer gate) —
    // an unbalanced journal must not be persistable even as a draft.
    assert.match(src, /data-testid="action-save-draft"[^>]*disabled=\{hook\.isSaving \|\| !isDirty \|\| blockSaveForBalance\}/);
  });

  it('gates the existing-record Save button with !isDirty', () => {
    // The non-draftMode existing-record Save button checks isDocumentReadOnly, isSaving, !isDirty,
    // AND blockSaveForBalance (ETP-4244 balance footer gate).
    assert.match(src, /disabled=\{isDocumentReadOnly \|\| hook\.isSaving \|\| !isDirty \|\| blockSaveForBalance\}/);
  });

  it('does NOT gate the new-record Save button with isDirty', () => {
    // New-record Save must only check isDocumentReadOnly, isSaving, and blockSaveForBalance — never !isDirty.
    assert.match(src, /disabled=\{isDocumentReadOnly \|\| hook\.isSaving \|\| blockSaveForBalance\}/);
  });

  it('does NOT gate the draftMode Confirm button with !isDirty', () => {
    // The Confirm button in draftMode is gated by hook.isSaving and blockCompleteForBalance
    // (ETP-4244 balance/empty footer gate) — but NEVER by !isDirty.
    assert.match(src, /data-testid="action-save" disabled=\{hook\.isSaving \|\| blockCompleteForBalance/);
    // Double-check: the full disabled expression for the Confirm button must NOT contain !isDirty.
    // (It may contain !hook.childrenLoading — that token is unrelated and must not trip a false match.)
    const confirmIdx = src.indexOf('data-testid="action-save" disabled={hook.isSaving || blockCompleteForBalance');
    assert.notEqual(confirmIdx, -1);
    const around = src.slice(confirmIdx, confirmIdx + 200);
    assert.doesNotMatch(around, /!isDirty/);
  });
});

describe('DetailView — distinct test ids for new-record Save vs Confirm (PR #716)', () => {
  it('uses data-testid="action-complete" for the new-record Confirm button', () => {
    // The new-record Confirm button (handleSaveAndProcess, gated only by isSaving +
    // blockCompleteForBalance) must NOT reuse data-testid="action-save" — that would
    // collide with the new-record Save button and make getByTestId('action-save')
    // ambiguous in E2E. The draftMode Confirm keeps action-save (its disabled
    // expression has a trailing "|| (draftMode..." so it won't match this regex).
    assert.match(src, /data-testid="action-complete" disabled=\{hook\.isSaving \|\| blockCompleteForBalance\}/);
  });

  it('does not render two action-save buttons in the new-record path', () => {
    // Guard against re-introducing the duplicate: the new-record Confirm must not
    // carry the same gate-expression as a second action-save.
    assert.doesNotMatch(src, /data-testid="action-save" disabled=\{hook\.isSaving \|\| blockCompleteForBalance\}/);
  });
});
