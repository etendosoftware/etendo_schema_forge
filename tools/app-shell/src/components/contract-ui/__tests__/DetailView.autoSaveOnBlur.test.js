import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

/**
 * Regression guard for the auto-save-on-blur feature, updated for ETP-4524.
 *
 * ETP-3660 wired autoSaveOnBlur PER-INPUT via `onFieldBlur` on each Form
 * instance. That wiring is the source of ETP-4524's Race 3: tabbing through N
 * header fields fires N independent `hook.handleSave()` calls (one per field
 * blur), each racing the others — an older in-flight PATCH response can land
 * after a newer one and clobber it (see useEntity.js handleSave / Race 3).
 *
 * The fix moves autoSaveOnBlur to the CONTAINER level: a single handler on the
 * header form wrapper that only fires when focus leaves the wrapper entirely
 * (checked via `e.relatedTarget` not being contained in the wrapper), not on
 * every per-input blur — collapsing "tab through 5 fields" into a single
 * trailing save. The `onMouseDown` bridge for inlineEditable lines sections
 * is unrelated to this race and must remain untouched.
 */
describe('DetailView — autoSaveOnBlur container-level wiring (ETP-4524)', () => {
  it('declares autoSaveOnBlur prop with a false default', () => {
    assert.match(src, /autoSaveOnBlur\s*=\s*false/);
  });

  it('holds a ref to the header form wrapper element', () => {
    assert.match(
      src,
      /const\s+\w*(?:HeaderForm|FormWrapper|HeaderContainer)\w*Ref\s*=\s*useRef/,
      'expected a useRef for the header form wrapper (e.g. headerFormWrapperRef)',
    );
  });

  it('defines a container-level blur handler that checks relatedTarget against the wrapper', () => {
    assert.match(src, /relatedTarget/, 'expected a check against e.relatedTarget');
    assert.match(
      src,
      /\.contains\(\s*\w*[Rr]elatedTarget\w*\s*\)/,
      'expected a `<wrapperRef>.current.contains(relatedTarget)` style containment check ' +
      'so the handler only fires when focus leaves the wrapper entirely',
    );
  });

  it('wires the container blur handler on the header form wrapper via onBlur, guarded by autoSaveOnBlur', () => {
    assert.match(
      src,
      /onBlur=\{autoSaveOnBlur\s*\?\s*\w*(?:handleContainerBlur|handleHeaderBlur|handleFormWrapperBlur|handleFieldBlur)\w*\s*:\s*undefined\}/,
      'expected onBlur={autoSaveOnBlur ? <containerBlurHandler> : undefined} on the header form wrapper',
    );
  });

  it('no longer wires onFieldBlur per-Form (removed the per-input race source)', () => {
    const matches = src.match(/onFieldBlur=\{autoSaveOnBlur\s*\?\s*handleFieldBlur\s*:\s*undefined\}/g);
    assert.ok(
      !matches,
      'per-Form onFieldBlur wiring should be removed in favor of a single container-level onBlur',
    );
  });

  it('still fires the blur handler on mouseDown in the lines section for inlineEditable (unrelated to this fix)', () => {
    assert.match(
      src,
      /onMouseDown=\{autoSaveOnBlur\s*&&\s*linesLayout\s*===\s*['"]inlineEditable['"]\s*\?\s*\(\)\s*=>\s*handleFieldBlurRef\.current\?\.\(\)\s*:\s*undefined\}/,
    );
  });
});
