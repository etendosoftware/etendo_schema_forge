import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

/**
 * Regression guard for the auto-save-on-blur feature introduced in ETP-3660.
 *
 * When `autoSaveOnBlur` is true, DetailView must:
 *  1. Accept the prop (default false).
 *  2. Define a `handleFieldBlur` callback that checks for unsaved changes
 *     before calling `hook.handleSave()`.
 *  3. Pass `onFieldBlur` to both Form instances (principal and collapsed sections).
 *  4. Fire `handleFieldBlur` on mouseDown in the lines section for inlineEditable
 *     windows — this saves the header even when only selector/search fields were
 *     changed (they don't fire onBlur, so field-level triggers miss them).
 */
describe('DetailView — autoSaveOnBlur (ETP-3660 regression)', () => {
  it('declares autoSaveOnBlur prop with a false default', () => {
    assert.match(src, /autoSaveOnBlur\s*=\s*false/);
  });

  it('defines handleFieldBlur with a dirty-state check', () => {
    assert.match(src, /handleFieldBlur/);
    assert.match(src, /hook\.editing/);
    assert.match(src, /hook\.selected/);
    assert.match(src, /hook\.handleSave/);
  });

  it('passes onFieldBlur to the principal-section Form', () => {
    assert.match(src, /onFieldBlur=\{autoSaveOnBlur\s*\?\s*handleFieldBlur\s*:\s*undefined\}/);
  });

  it('passes onFieldBlur to the collapsed-section Form', () => {
    const matches = src.match(
      /onFieldBlur=\{autoSaveOnBlur\s*\?\s*handleFieldBlur\s*:\s*undefined\}/g,
    );
    assert.ok(matches && matches.length >= 2, 'onFieldBlur must appear on both Form instances');
  });

  it('fires handleFieldBlur on mouseDown in lines section for inlineEditable', () => {
    assert.match(
      src,
      /onMouseDown=\{autoSaveOnBlur\s*&&\s*linesLayout\s*===\s*['"]inlineEditable['"]\s*\?\s*\(\)\s*=>\s*handleFieldBlurRef\.current\?\.\(\)\s*:\s*undefined\}/,
    );
  });
});
