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
    assert.match(
      src,
      /!hideSaveStatuses\.includes\(\s*_headerData\?\.documentStatus\s*\)\s*&&\s*!isDraftModeCompleted/,
    );
  });
});
