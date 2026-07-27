import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'CloneButton.jsx'), 'utf8');

describe('CloneButton', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports CloneButton as the default export', () => {
    assert.match(src, /export default function CloneButton/);
  });

  it('accepts onClick and title props', () => {
    assert.match(src, /onClick/);
    assert.match(src, /title/);
  });

  // ── Hover state ────────────────────────────────────────────────────────────

  it('uses useState to track hover state', () => {
    assert.match(src, /useState\(false\)/);
  });

  it('sets hover background to the semantic muted role on mouseenter', () => {
    assert.match(src, /hovered \? 'hsl\(var\(--muted\)\)'/);
    assert.match(src, /onMouseEnter/);
    assert.match(src, /onMouseLeave/);
  });

  // ── Secondary Outline style ────────────────────────────────────────────────

  it('uses the semantic control-border role', () => {
    assert.match(src, /hsl\(var\(--border-control\)\)/);
  });

  it('uses the semantic muted foreground role', () => {
    assert.match(src, /hsl\(var\(--muted-foreground\)\)/);
  });

  it('renders a button with type="button"', () => {
    assert.match(src, /type="button"/);
  });

  // ── Copy icon ──────────────────────────────────────────────────────────────

  it('renders a copy icon SVG with two paths', () => {
    assert.match(src, /<rect/);
    assert.match(src, /<path/);
  });

});
