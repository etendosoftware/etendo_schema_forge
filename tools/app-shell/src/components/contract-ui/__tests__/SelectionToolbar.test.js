import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SelectionToolbar.jsx'), 'utf8');

/**
 * ETP-4972 root-cause regression guard: the old LinesSelectionBar positioned
 * itself from `getBoundingClientRect()` on a sentinel `<div>` at the end of a
 * scrollable list. On a long list, once that sentinel scrolled out of view,
 * the "fixed" bar rendered off-screen too. SelectionToolbar was rebuilt to
 * own true viewport-fixed coordinates outright — no ref, no rect
 * measurement, no scroll/resize listener of any kind. A future edit that
 * reintroduces ANY of these is exactly the class of bug this ticket fixed,
 * so this file asserts their absence directly on the source text (belt and
 * suspenders alongside SelectionToolbar.vitest.jsx's DOM-level style check).
 */
describe('SelectionToolbar — structural contract', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function SelectionToolbar/);
  });

  it('portals to document.body', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /document\.body/);
  });

  it('returns null when visible is false', () => {
    assert.match(src, /if \(!visible\) return null/);
  });

  it('uses true viewport-fixed positioning (bottom/left/transform), not top/height derived from a rect', () => {
    assert.match(src, /bottom:\s*24/);
    assert.match(src, /left:\s*'50%'/);
    assert.match(src, /transform:\s*'translateX\(-50%\)'/);
  });

  it('never uses useRef, getBoundingClientRect, or a scroll/resize listener to compute its position', () => {
    // Matched as a method CALL on some object (`.getBoundingClientRect(`),
    // not merely mentioned in prose — the file's own header comment explains
    // the old bug via a bare `getBoundingClientRect()` in a sentence, which
    // must stay legal.
    assert.doesNotMatch(src, /\.getBoundingClientRect\s*\(/);
    assert.doesNotMatch(src, /\buseRef\s*\(/);
    assert.doesNotMatch(src, /addEventListener\(\s*['"](scroll|resize)['"]/);
    assert.doesNotMatch(src, /\bbarRect\b/);
  });

  it('renders a trailing close (X) button wired to onClose', () => {
    assert.match(src, /<X\b/);
    assert.match(src, /onClick=\{onClose\}/);
  });

  it('applies appear/dismiss animation classes driven by the closing prop', () => {
    assert.match(src, /lines-bar-appear/);
    assert.match(src, /lines-bar-dismiss/);
    assert.match(src, /closing\s*\?\s*'lines-bar-dismiss'\s*:\s*'lines-bar-appear'/);
  });

  it('renders a divider after each top-level child via Children.toArray', () => {
    assert.match(src, /Children\.toArray\(children\)/);
    assert.match(src, /SelectionToolbarDivider/);
  });
});
