import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PrintButton.jsx'), 'utf8');

describe('PrintButton', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports PrintButton as the default export', () => {
    assert.match(src, /export default function PrintButton/);
  });

  // ── Props contract ─────────────────────────────────────────────────────────

  it('accepts onClick prop', () => {
    assert.match(src, /onClick/);
  });

  it('accepts loading prop', () => {
    assert.match(src, /loading/);
  });

  it('is disabled when loading is true', () => {
    assert.match(src, /disabled=\{loading\}/);
  });

  // ── i18n ───────────────────────────────────────────────────────────────────

  it('imports useUI from @/i18n (no hardcoded strings)', () => {
    assert.match(src, /import.*useUI.*from '@\/i18n'/);
  });

  it("calls useUI with key 'print'", () => {
    assert.match(src, /ui\('print'\)/);
  });

  // ── Markup ─────────────────────────────────────────────────────────────────

  it('renders a button with type="button"', () => {
    assert.match(src, /type="button"/);
  });

  it('renders a printer SVG icon', () => {
    assert.match(src, /<svg/);
    assert.match(src, /<path/);
    assert.match(src, /<rect/);
  });

});
