import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  new URL('../InlineLinesPanel.jsx', import.meta.url),
  'utf8',
);

// ETP-4005 — InlineLinesPanel introduced two internal helpers to lower the
// cognitive complexity of commitField and EditCell, plus a min-value
// validation path. These helpers are not exported, so behavior is checked
// against the source text.

describe('InlineLinesPanel helpers (ETP-4005)', () => {
  describe('editInputClassName', () => {
    it('is declared as an internal helper', () => {
      assert.match(src, /function editInputClassName\(isNumeric, isInvalid\)/);
    });

    it('returns the red-border class when the cell is invalid', () => {
      assert.match(src, /isInvalid\s*\?\s*'border-red-500 focus-visible:ring-red-500'/);
    });

    it('returns the default border class when the cell is valid', () => {
      assert.match(src, /:\s*'border-input'/);
    });

    it('adds right-aligned tabular-nums for numeric cells', () => {
      assert.match(src, /isNumeric\s*\?\s*' text-right tabular-nums'/);
    });
  });

  describe('isValueBelowMin', () => {
    it('is declared as an internal helper', () => {
      assert.match(src, /function isValueBelowMin\(col, value\)/);
    });

    it('short-circuits when col.min is undefined or value is empty', () => {
      assert.match(src, /col\.min === undefined \|\| value === '' \|\| value == null/);
    });

    it('parses the value with parseFloat before comparing', () => {
      assert.match(src, /parseFloat\(value\)/);
    });

    it('compares the parsed number against col.min', () => {
      assert.match(src, /num < col\.min/);
    });
  });

  describe('clampToMax (ETP-4277)', () => {
    it('is declared as an internal helper', () => {
      assert.match(src, /function clampToMax\s*\(\s*col\s*,\s*value\s*\)/);
    });

    it('guards against non-numeric column types at the top', () => {
      // Prevents accidental substitution in string/selector/date columns.
      assert.match(src, /if \(!NUMERIC_TYPES\.has\(col\.type\)\) return value;/);
    });

    it('substitutes defaultValue when value is empty and defaultValue is declared', () => {
      // The empty-branch must appear before the max-check so it catches cleared fields.
      assert.match(src, /if \(value === '' \|\| value == null\)/);
      assert.match(src, /col\.defaultValue !== undefined.*return String\(col\.defaultValue\)/s);
    });

    it('falls back to min when value is empty and only min is declared', () => {
      assert.match(src, /col\.min !== undefined.*return String\(col\.min\)/s);
    });

    it('clamps to max when the numeric value exceeds col.max', () => {
      assert.match(src, /num > col\.max \? String\(col\.max\) : value/);
    });
  });

  describe('commit-time min-value enforcement', () => {
    it('fires the fieldMinValueError toast when a value violates the min rule', () => {
      assert.match(src, /toast\.error\(ui\('fieldMinValueError'\)\)/);
    });

    it('flags the cell via setInvalidCell with the offending rowId and colKey', () => {
      assert.match(src, /setInvalidCell\(\{\s*rowId: row\.id, colKey: col\.key\s*\}\)/);
    });

    it('keeps edit mode open by setting hasValidationErrorRef.current = true', () => {
      assert.match(src, /hasValidationErrorRef\.current = true/);
    });

    it('uses editInputClassName for the edit-cell className', () => {
      assert.match(src, /className=\{editInputClassName\(isNumeric, isInvalid\)\}/);
    });
  });
});
