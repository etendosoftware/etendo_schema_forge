import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  new URL('../DataTable.jsx', import.meta.url),
  'utf8',
);

// ETP-4005 — DataTable introduced two internal helpers extracted from
// InlineAddRow to lower its cognitive complexity. These helpers feed the
// invalidFields Set that drives the red-border UX on the add-row.

describe('DataTable helpers (ETP-4005)', () => {
  describe('isMissingRequired', () => {
    it('is declared as an internal helper', () => {
      assert.match(src, /function isMissingRequired\(f, valuesRef, fields = \[\]\)/);
    });

    it('returns false when the field is not required', () => {
      assert.match(src, /if \(!f\.required\) return false/);
    });

    it('never flags a required checkbox/boolean (unchecked is a valid value)', () => {
      assert.match(src, /if \(f\.type === 'checkbox' \|\| f\.type === 'boolean'\) return false/);
    });

    it('treats a clearsField mutually-exclusive group as one-of (either member satisfies both)', () => {
      assert.match(src, /if \(f\.clearsField && hasVal\(f\.clearsField\)\) return false/);
      assert.match(src, /if \(g\.clearsField === f\.key && hasVal\(g\.key\)\) return false/);
    });

    it('treats null, empty string, and whitespace-only strings as missing', () => {
      assert.match(
        src,
        /v == null \|\| v === '' \|\| \(typeof v === 'string' && v\.trim\(\) === ''\)/,
      );
    });
  });

  describe('isBelowMin', () => {
    it('is declared as an internal helper', () => {
      assert.match(src, /function isBelowMin\(f, valuesRef\)/);
    });

    it('short-circuits when f.min is undefined', () => {
      assert.match(src, /if \(f\.min === undefined\) return false/);
    });

    it('skips empty or null values (only flags actual numeric violations)', () => {
      assert.match(src, /if \(v == null \|\| v === ''\) return false/);
    });

    it('coerces to Number and compares against f.min', () => {
      assert.match(src, /!isNaN\(Number\(v\)\) && Number\(v\) < f\.min/);
    });
  });

  describe('InlineAddRow validation wiring', () => {
    it('filters fields by isMissingRequired to populate invalidFields', () => {
      assert.match(src, /fields\.filter\(f => isMissingRequired\(f, valuesRef, fields\)\)/);
    });

    it('filters fields by isBelowMin to populate invalidFields', () => {
      assert.match(src, /fields\.filter\(f => isBelowMin\(f, valuesRef\)\)/);
    });

    it('keeps an invalidFields Set on InlineAddRow state', () => {
      assert.match(src, /const \[invalidFields, setInvalidFields\] = useState\(new Set\(\)\)/);
    });

    it('passes isInvalid={invalidFields.has(field.key)} to the input', () => {
      assert.match(src, /isInvalid=\{invalidFields\.has\(field\.key\)\}/);
    });
  });
});
