import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

/**
 * Regression guard for the framework feature introduced in ETP-3873:
 * `draftMode.completedStatuses` lets a window declare an explicit list of
 * documentStatus values that should hide Save/Confirm. Without this branch,
 * `processed === 'Y'` alone triggers the lock — which broke sales-quotation
 * during Under Evaluation (UE), where Etendo flips processed to Y but the
 * pair must remain visible until the user confirms or rejects.
 *
 * ETP-4268 follow-up: the array branch used to always read
 * `_headerData?.documentStatus`, ignoring a window's configured
 * `statusField` (decisions.json → window.statusField). This broke
 * goods-movements, whose status lives in a boolean `processed` field, not
 * `documentStatus` — the "Procesar" button never hid because
 * `completedStatuses` never matched. The fix resolves the compared value via
 * `_headerData?.[statusField || 'documentStatus']` and normalizes
 * boolean-ish values (true/'Y' -> 'true', false/'N' -> 'false') before the
 * `.includes(...)` check, so windows can declare completedStatuses as string
 * literals regardless of whether their status field is an enum or a boolean
 * flag. See DetailView.draftModeStatusField.vitest.jsx for the behavioral
 * coverage of this fix.
 */
describe('DetailView — draftMode.completedStatuses (ETP-3873 regression)', () => {
  it('reads draftMode.completedStatuses as an array branch', () => {
    assert.match(src, /Array\.isArray\(\s*draftMode\.completedStatuses\s*\)/);
  });

  it('resolves the compared value from statusField, falling back to documentStatus (ETP-4268)', () => {
    assert.match(
      src,
      /_headerData\?\.\[\s*statusField\s*\|\|\s*['"]documentStatus['"]\s*\]/,
    );
  });

  it('normalizes the resolved value through normalizeStatusValue before matching the array (ETP-4268)', () => {
    assert.match(
      src,
      /draftMode\.completedStatuses\.includes\(\s*normalizeStatusValue\(\s*statusValue\s*\)\s*\)/,
    );
  });

  it('keeps the legacy fallback (processed===Y or status===CO) when the array is absent', () => {
    assert.match(src, /isProcessed\s*\|\|\s*_headerData\?\.documentStatus\s*===\s*['"]CO['"]/);
  });

  it('only triggers the lock when draftMode is enabled', () => {
    assert.match(src, /draftMode\?\.enabled\s*&&/);
  });

  it('feeds the result to the Save-button gate', () => {
    // ETP-4839: the literal `!isDraftModeCompleted` gate grew an OR-escape hatch
    // so a window can opt into keeping the block rendered once completed (Save's
    // own enabled/disabled state is then a SEPARATE per-field gate — see
    // buildSaveGate/buildCompletedFieldsGate in saveActions.jsx, and
    // DetailView.saveButtons.vitest.jsx for the behavioral coverage). The escape
    // hatch itself was extracted to the module-level `shouldRenderSaveActionsRow`
    // helper (S3776 cognitive-complexity fix) rather than inlined here, so this
    // regex now pins the CALL, not the boolean expression it used to inline.
    assert.match(
      src,
      /!hideSaveStatuses\.includes\(\s*_headerData\?\.documentStatus\s*\)\s*&&\s*shouldRenderSaveActionsRow\(\s*isDraftModeCompleted,\s*draftMode\s*\)/,
    );
  });

  // ETP-4839 — `draftMode.keepSaveWhenCompletedFields` lets a window keep the footer
  // Save button visible once completed while Confirm stays hidden. Regression
  // guard: the escape hatch must appear at BOTH call sites that gate
  // renderSaveActions (saveActionsFirst and its !saveActionsFirst mirror), or a
  // window using saveActionsFirst would silently lose the feature.
  it('applies the shouldRenderSaveActionsRow escape hatch at both saveActionsFirst call sites (ETP-4839)', () => {
    const pattern = /!hideSaveStatuses\.includes\(\s*_headerData\?\.documentStatus\s*\)\s*&&\s*shouldRenderSaveActionsRow\(\s*isDraftModeCompleted,\s*draftMode\s*\)\s*\n\s*&&\s*renderSaveActions\(saveActionParams\)/g;
    const matches = src.match(pattern) || [];
    assert.equal(matches.length, 2);
  });

  // ETP-4839 — `onlySaveButton` must be derived from the SAME isDraftModeCompleted
  // this file already tests, not a second ad-hoc completion check, or the two
  // could drift (e.g. one honoring completedStatuses, the other not). The check
  // itself lives in the module-level `onlySaveButtonForCompletedDoc` helper
  // (S3776 cognitive-complexity fix), so this regex pins the CALL.
  it('derives saveActionParams.onlySaveButton from onlySaveButtonForCompletedDoc(isDraftModeCompleted, draftMode) (ETP-4839)', () => {
    assert.match(
      src,
      /onlySaveButton:\s*onlySaveButtonForCompletedDoc\(\s*isDraftModeCompleted,\s*draftMode\s*\)/,
    );
  });

  // ETP-4839 — the extraction itself: both helpers must be genuine module-level
  // functions (not inline in DetailView's body / not nested closures), which is
  // what keeps this logic off DetailView's own S3776 score. A regression here
  // (e.g. someone inlining the logic back into DetailView "for clarity") would
  // silently reintroduce the CRITICAL Sonar finding this refactor fixed.
  it('declares shouldRenderSaveActionsRow and onlySaveButtonForCompletedDoc as module-level functions, each equivalent to the pre-extraction inline expression', () => {
    assert.match(
      src,
      /function shouldRenderSaveActionsRow\(isDraftModeCompleted, draftMode\) \{ return !isDraftModeCompleted \|\| \(Array\.isArray\(draftMode\?\.keepSaveWhenCompletedFields\) && draftMode\.keepSaveWhenCompletedFields\.length > 0\); \}/,
    );
    assert.match(
      src,
      /function onlySaveButtonForCompletedDoc\(isDraftModeCompleted, draftMode\) \{ return isDraftModeCompleted && shouldRenderSaveActionsRow\(isDraftModeCompleted, draftMode\); \}/,
    );
  });
});
