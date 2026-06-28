import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIELD_HEIGHT, FIELD_HEIGHT_IMPORTANT, FIELD_PADDING, ROW_GAP_Y, LABEL_GAP } from '../formDensity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiDir = join(__dirname, '..');

// ETP-4321: a single source of truth for form-field density so a density change
// propagates to every document window automatically. These exact values are
// load-bearing — base primitives (input/select/date-field) and EntityForm all
// interpolate them, so pinning them here guards against silent drift.
describe('formDensity tokens (ETP-4321)', () => {
  it('FIELD_HEIGHT is h-9 (36px)', () => {
    assert.equal(FIELD_HEIGHT, 'h-9');
  });

  // The important variant must be a LITERAL `!h-9` (not `!${FIELD_HEIGHT}` built
  // at a call site) so Tailwind's JIT scanner can extract the important rule.
  // EntityCreationModal/AddressSection interpolate this token directly.
  it('FIELD_HEIGHT_IMPORTANT is the literal !h-9 (Tailwind JIT-extractable important variant)', () => {
    assert.equal(FIELD_HEIGHT_IMPORTANT, '!h-9');
  });

  it('FIELD_PADDING is px-2 py-1.5', () => {
    assert.equal(FIELD_PADDING, 'px-2 py-1.5');
  });

  it('ROW_GAP_Y is gap-y-3 (12px)', () => {
    assert.equal(ROW_GAP_Y, 'gap-y-3');
  });

  it('LABEL_GAP is space-y-1 (4px)', () => {
    assert.equal(LABEL_GAP, 'space-y-1');
  });

  it('base field primitives consume the tokens (single source of truth, not hardcoded heights)', () => {
    const input = readFileSync(join(uiDir, 'input.jsx'), 'utf8');
    const select = readFileSync(join(uiDir, 'select.jsx'), 'utf8');
    const dateField = readFileSync(join(uiDir, 'date-field.jsx'), 'utf8');

    for (const [name, src] of [['input', input], ['select', select], ['date-field', dateField]]) {
      assert.match(src, /from ['"]\.\/formDensity\.js['"]/, `${name}.jsx must import the density tokens`);
      assert.match(src, /\$\{FIELD_HEIGHT\}/, `${name}.jsx must interpolate FIELD_HEIGHT`);
    }
  });
});
