import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'input.jsx'), 'utf8');

// Pull the multi-line cn(`…`) template literal assigned to className. The base
// className became a template literal in ETP-4321 so the density tokens
// (FIELD_HEIGHT / FIELD_PADDING) can be interpolated from a single source.
function extractInputClass(source) {
  const match = source.match(/className=\{[\s\S]*?cn\(\s*\n?\s*`([^`]+)`/);
  return match ? match[1] : null;
}

describe('Input — Figma form-input tokens (ETP-3893 + ETP-4000 + ETP-4321)', () => {
  const inputClass = extractInputClass(src);

  it('source exposes a single canonical class string', () => {
    assert.ok(inputClass, 'could not extract Input base className');
  });

  it('drives height from the shared FIELD_HEIGHT density token (ETP-4321)', () => {
    assert.match(inputClass, /\$\{FIELD_HEIGHT\}/);
    assert.match(src, /import \{[^}]*FIELD_HEIGHT[^}]*\} from "\.\/formDensity\.js"/);
  });

  it('does NOT hardcode a field height — height must come from the token', () => {
    assert.doesNotMatch(inputClass, /(^|\s)h-\d+(\s|$)/);
  });

  it('uses 8px border-radius (rounded-lg)', () => {
    assert.match(inputClass, /(^|\s)rounded-lg(\s|$)/);
  });

  it('uses the Figma border color #D1D4DB', () => {
    assert.match(inputClass, /border-\[#D1D4DB\]/);
  });

  it('drives padding from the shared FIELD_PADDING density token (ETP-4321)', () => {
    assert.match(inputClass, /\$\{FIELD_PADDING\}/);
    assert.match(src, /import \{[^}]*FIELD_PADDING[^}]*\} from "\.\/formDensity\.js"/);
  });

  it('uses the Figma form fill #F5F7F9 (ETP-4000)', () => {
    assert.match(inputClass, /bg-\[#F5F7F9\]/);
  });

  it('uses the Figma placeholder color #828FA3 (ETP-4000)', () => {
    assert.match(inputClass, /placeholder:text-\[#828FA3\]/);
  });

  it('does NOT carry a drop shadow — Figma ETP-4000 renders the field flat', () => {
    assert.doesNotMatch(inputClass, /(^|\s)shadow-/, 'no Tailwind shadow utility should be on the base Input');
    assert.doesNotMatch(inputClass, /shadow-\[0px_1px_2px_rgba\(18,18,23,0\.05\)\]/);
  });

  it('does NOT regress to the legacy rounded-md / shadow-sm pairing', () => {
    assert.doesNotMatch(inputClass, /(^|\s)rounded-md(\s|$)/);
    assert.doesNotMatch(inputClass, /(^|\s)shadow-sm(\s|$)/);
  });

  it('resolves FIELD_HEIGHT to 36px (h-9) and FIELD_PADDING to px-2 py-1.5 (ETP-4321)', async () => {
    const { FIELD_HEIGHT, FIELD_PADDING } = await import('../formDensity.js');
    assert.equal(FIELD_HEIGHT, 'h-9');
    assert.equal(FIELD_PADDING, 'px-2 py-1.5');
  });

  it('does NOT use the legacy bg-transparent (ETP-4000 sets the form fill)', () => {
    assert.doesNotMatch(inputClass, /(^|\s)bg-transparent(\s|$)/);
  });
});
