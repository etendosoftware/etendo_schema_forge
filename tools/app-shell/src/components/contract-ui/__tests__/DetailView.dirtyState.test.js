import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');
// ETP-4933 moved the five primary persist buttons (Save / Save Draft / Confirm)
// out of DetailView.jsx into this sibling module, forced by the committed
// no-growth guardrail (.claude/hooks/check-detailview-growth.mjs). The
// `isDirty` composite expression and `additionalDirtyState` prop stayed in
// DetailView.jsx and are still read from `src`; every button assertion below
// reads `srcSave` instead. Each block below is checked against exactly ONE of
// the two files — never concatenated — so a match can't accidentally succeed
// against the wrong module.
const srcSave = readFileSync(join(__dirname, '..', 'saveActions.jsx'), 'utf8');

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

describe('saveActions.jsx — Save button disabled conditions (ETP-3662)', () => {
  it('gates the draftMode Save Draft button with !isDirty AND blockSaveForBalance', () => {
    // action-save-draft is the Save Draft button in draftMode windows. It checks
    // isSaving, !isDirty, AND blockSaveForBalance (ETP-4244 balance footer gate) —
    // an unbalanced journal must not be persistable even as a draft. `[^>]*` skips
    // over the `data-missing-required={saveGate.missingAttr}` attribute that ETP-4933
    // now inserts before data-testid.
    assert.match(
      srcSave,
      /data-testid="action-save-draft"[^>]*disabled=\{hook\.isSaving \|\| !isDirty \|\| blockSaveForBalance \|\| saveGate\.blocked\}/,
    );
  });

  it('gates the existing-record Save button with !isDirty', () => {
    // The non-draftMode existing-record Save button checks isDocumentReadOnly, isSaving, !isDirty,
    // blockSaveForBalance (ETP-4244 balance footer gate), AND saveGate.blocked (ETP-4933).
    assert.match(
      srcSave,
      /disabled=\{isDocumentReadOnly \|\| hook\.isSaving \|\| !isDirty \|\| blockSaveForBalance \|\| saveGate\.blocked\}/,
    );
  });

  it('does NOT gate the new-record Save button with isDirty', () => {
    // New-record Save must only check isDocumentReadOnly, isSaving, blockSaveForBalance,
    // and saveGate.blocked — never !isDirty.
    assert.match(
      srcSave,
      /disabled=\{isDocumentReadOnly \|\| hook\.isSaving \|\| blockSaveForBalance \|\| saveGate\.blocked\}/,
    );
  });

  it('does NOT gate the draftMode Confirm button with !isDirty', () => {
    // The Confirm button in draftMode is gated by hook.isSaving, blockCompleteForBalance
    // (ETP-4244 balance/empty footer gate), and saveGate.blocked (ETP-4933) — but NEVER
    // by !isDirty.
    assert.match(srcSave, /data-testid="action-save" disabled=\{hook\.isSaving \|\| blockCompleteForBalance/);
    // Double-check: the full disabled expression for the Confirm button must NOT contain !isDirty.
    // (It may contain !hook.childrenLoading — that token is unrelated and must not trip a false match.)
    const confirmIdx = srcSave.indexOf('data-testid="action-save" disabled={hook.isSaving || blockCompleteForBalance');
    assert.notEqual(confirmIdx, -1);
    const around = srcSave.slice(confirmIdx, confirmIdx + 220);
    assert.doesNotMatch(around, /!isDirty/);
  });
});

describe('saveActions.jsx — distinct test ids for new-record Save vs Confirm (PR #716)', () => {
  it('uses data-testid="action-complete" for the new-record Confirm button', () => {
    // The new-record Confirm button (handleSaveAndProcess, gated only by isSaving,
    // blockCompleteForBalance, and saveGate.blocked) must NOT reuse
    // data-testid="action-save" — that would collide with the new-record Save button
    // and make getByTestId('action-save') ambiguous in E2E. The draftMode Confirm
    // keeps action-save (its disabled expression has a trailing "|| (draftMode..."
    // so it won't match this regex).
    assert.match(
      srcSave,
      /data-testid="action-complete" disabled=\{hook\.isSaving \|\| blockCompleteForBalance \|\| saveGate\.blocked\}/,
    );
  });

  it('does not render two action-save buttons in the new-record path', () => {
    // Guard against re-introducing the duplicate: the new-record Confirm must not
    // carry the same gate-expression as a second action-save.
    assert.doesNotMatch(
      srcSave,
      /data-testid="action-save" disabled=\{hook\.isSaving \|\| blockCompleteForBalance \|\| saveGate\.blocked\}/,
    );
  });
});

/**
 * ETP-4933 — required-field Save gate. Every one of the five primary persist
 * buttons must honour `saveGate`: `saveGate.blocked` as the LAST term of its
 * `disabled` expression, and `data-missing-required={saveGate.missingAttr}` as
 * its FIRST attribute (right after `<Button `). Asserted per-button, by
 * data-testid + the button's own context window, so a future refactor cannot
 * silently drop the gate from just one of the five without a test noticing —
 * one shared regex across all five would not catch that.
 */
describe('saveActions.jsx — saveGate wiring on every primary persist button (ETP-4933)', () => {
  function buttonBlock(testId, occurrence = 0) {
    const marker = `data-testid="${testId}"`;
    let idx = -1;
    for (let i = 0; i <= occurrence; i++) {
      idx = srcSave.indexOf(marker, idx + 1);
      assert.notEqual(idx, -1, `Could not find occurrence #${occurrence} of ${marker}`);
    }
    // Walk backward to the start of this Button's opening tag, and forward to
    // its closing '>', so the extracted block is exactly this one <Button ...>.
    const tagStart = srcSave.lastIndexOf('<Button', idx);
    const tagEnd = srcSave.indexOf('>', idx);
    assert.notEqual(tagStart, -1);
    assert.notEqual(tagEnd, -1);
    return srcSave.slice(tagStart, tagEnd + 1);
  }

  it('action-save-draft (draftMode Save Draft): gated by saveGate.blocked and exposes data-missing-required', () => {
    const block = buttonBlock('action-save-draft');
    assert.match(block, /<Button data-missing-required=\{saveGate\.missingAttr\}/);
    assert.match(block, /disabled=\{[^}]*\|\| saveGate\.blocked\}/);
  });

  it('action-save (draftMode Confirm, 1st occurrence): gated by saveGate.blocked and exposes data-missing-required', () => {
    const block = buttonBlock('action-save', 0);
    assert.match(block, /<Button data-missing-required=\{saveGate\.missingAttr\}/);
    assert.match(block, /disabled=\{[^}]*\|\| saveGate\.blocked\}/);
  });

  it('action-save (new-record Save, 2nd occurrence): gated by saveGate.blocked and exposes data-missing-required', () => {
    const block = buttonBlock('action-save', 1);
    assert.match(block, /<Button data-missing-required=\{saveGate\.missingAttr\}/);
    assert.match(block, /disabled=\{[^}]*\|\| saveGate\.blocked\}/);
  });

  it('action-complete (new-record Confirm): gated by saveGate.blocked and exposes data-missing-required', () => {
    const block = buttonBlock('action-complete');
    assert.match(block, /<Button data-missing-required=\{saveGate\.missingAttr\}/);
    assert.match(block, /disabled=\{[^}]*\|\| saveGate\.blocked\}/);
  });

  it('action-save (existing-record Save, 3rd occurrence): gated by saveGate.blocked and exposes data-missing-required', () => {
    const block = buttonBlock('action-save', 2);
    assert.match(block, /<Button data-missing-required=\{saveGate\.missingAttr\}/);
    assert.match(block, /disabled=\{[^}]*\|\| saveGate\.blocked\}/);
  });

  it('there are exactly 3 action-save buttons across the 3 render functions (draftMode Confirm, new-record Save, existing-record Save)', () => {
    const count = srcSave.split('data-testid="action-save"').length - 1;
    assert.equal(count, 3);
  });
});

// ETP-4933: purely visual, so nothing else would catch a regression here.
describe('saveActions.jsx — secondary Save when a window has its own primary action', () => {
  it('new-record Save is primary (blue) by default — it IS the main action there', () => {
    const decl = srcSave.match(/const saveCls = .*/)[0];
    assert.match(decl, /hasExternalPrimaryAction \? `\$\{saveBtnCls\} \$\{SECONDARY_SAVE_CLS\}` : saveBtnCls/);
  });

  it('opts into variant="outline" only when the window declares a competing primary', () => {
    assert.match(srcSave, /\{\.\.\.\(hasExternalPrimaryAction \? \{ variant: 'outline' \} : \{\}\)\}/);
  });

  it('both renderers share one style constant so the secondary look cannot drift', () => {
    const uses = srcSave.match(/\$\{SECONDARY_SAVE_CLS\}/g) || [];
    assert.ok(uses.length >= 3, `expected the constant reused, saw ${uses.length}`);
    assert.equal(
      (srcSave.match(/bg-card border-\[hsl\(var\(--border-control\)\)\]/g) || []).length,
      1,
      'the literal class string must exist once (in the constant), never inlined again'
    );
  });
});
