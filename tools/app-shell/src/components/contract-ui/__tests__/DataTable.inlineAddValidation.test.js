import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source-shape tests for the ETP-4005 inline-add-row validation in DataTable.jsx
 * (`isMissingRequired`, `isBelowMin`, and the `submitLine` validation flow).
 *
 * Runtime coverage:
 *   - Required-field path: required-field-validation.mocked.spec.js
 *   - Min-value path:      inline-line-min-value.mocked.spec.js (ETP-4005)
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DataTable.jsx'), 'utf8');

describe('DataTable — inline-add-row validation (ETP-4005)', () => {
  // ── Pure helpers ──────────────────────────────────────────────────────────

  it('declares the isMissingRequired helper', () => {
    assert.match(src, /function isMissingRequired\s*\(\s*f\s*,\s*valuesRef\s*,\s*fields\s*=\s*\[\]\s*\)/);
  });

  it('isMissingRequired never flags a required checkbox/boolean (unchecked is valid)', () => {
    assert.match(src, /if \(f\.type === 'checkbox' \|\| f\.type === 'boolean'\) return false;/);
  });

  it('isMissingRequired honours the clearsField mutually-exclusive group', () => {
    // The empty member of a one-of pair must not be flagged while its partner
    // (the field it clears, or a sibling that clears it) carries a value.
    assert.match(src, /if \(f\.clearsField && hasVal\(f\.clearsField\)\) return false;/);
    assert.match(src, /if \(g\.clearsField === f\.key && hasVal\(g\.key\)\) return false;/);
  });

  it('isMissingRequired returns false when the field is not required', () => {
    assert.match(src, /if \(!f\.required\) return false;/);
  });

  it('isMissingRequired treats null, "", and whitespace-only strings as missing', () => {
    // The block reads the current value through the ref to dodge stale closures.
    assert.match(src, /v == null \|\| v === '' \|\| \(typeof v === 'string' && v\.trim\(\) === ''\)/);
  });

  it('declares the isBelowMin helper', () => {
    assert.match(src, /function isBelowMin\s*\(\s*f\s*,\s*valuesRef\s*\)/);
  });

  it('isBelowMin short-circuits when f.min is undefined', () => {
    assert.match(src, /if \(f\.min === undefined\) return false;/);
  });

  it('isBelowMin tolerates empty/null values (only checks numeric below-min)', () => {
    // Without this guard a cleared cell would be treated as 0 and might fail
    // a min:1 constraint.
    assert.match(src, /if \(v == null \|\| v === ''\) return false;/);
  });

  it('isBelowMin uses Number() with NaN guard before comparing to f.min', () => {
    assert.match(src, /!isNaN\(Number\(v\)\)\s*&&\s*Number\(v\)\s*<\s*f\.min/);
  });

  // ── submitLine wiring ─────────────────────────────────────────────────────

  it('submitLine runs the missing-required check BEFORE the below-min check', () => {
    const idxMissing = src.indexOf('const missing = fields.filter(f => isMissingRequired(f, valuesRef, fields));');
    const idxBelow   = src.indexOf('const belowMin = fields.filter(f => isBelowMin(f, valuesRef));');
    assert.ok(idxMissing > 0, 'missing-required check not found');
    assert.ok(idxBelow > idxMissing, 'below-min check must come after missing-required check');
  });

  it('keeps the inline-add row open on missing-required (returns Promise.resolve(false))', () => {
    // Must NOT enter the in-flight state — the row stays open so the user can fix it.
    const block = src.slice(src.indexOf('const missing = fields.filter'), src.indexOf('setIsSaving(true);'));
    assert.match(block, /setInvalidFields\(new Set\(missing\.map\(f => f\.key\)\)\)/);
    assert.match(block, /toast\.error\(ui\('requiredFieldsMissing'\)\)/);
    assert.match(block, /return Promise\.resolve\(false\);/);
  });

  it('keeps the inline-add row open on below-min and toasts fieldMinValueError', () => {
    const block = src.slice(src.indexOf('const belowMin = fields.filter'), src.indexOf('setIsSaving(true);'));
    assert.match(block, /setInvalidFields\(new Set\(belowMin\.map\(f => f\.key\)\)\)/);
    assert.match(block, /toast\.error\(ui\('fieldMinValueError'\)\)/);
    assert.match(block, /return Promise\.resolve\(false\);/);
  });

  it('focuses the first invalid field via its field-{key} data-testid', () => {
    // Used by both validation paths so the user is taken straight to the broken cell.
    assert.match(src, /\[data-testid="field-\$\{firstMissing\.key\}"\]/);
    assert.match(src, /\[data-testid="field-\$\{firstInvalid\.key\}"\]/);
  });

  it('uses i18n hooks (no hardcoded English) for both validation messages', () => {
    assert.match(src, /ui\('requiredFieldsMissing'\)/);
    assert.match(src, /ui\('fieldMinValueError'\)/);
    assert.doesNotMatch(src, /toast\.error\(['"`]Required fields are missing/);
    assert.doesNotMatch(src, /toast\.error\(['"`]Value cannot be negative/);
  });

  it('forwards invalidFields.has(field.key) to each rendered cell so the red border shows', () => {
    assert.match(src, /isInvalid=\{invalidFields\.has\(field\.key\)\}/);
  });

  it('initializes invalidFields as an empty Set in component state', () => {
    assert.match(src, /\[invalidFields, setInvalidFields\] = useState\(new Set\(\)\)/);
  });
});
