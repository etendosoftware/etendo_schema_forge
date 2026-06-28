import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source-shape tests for the ETP-4005 inline-edit min-value validation
 * (`isValueBelowMin`, `editInputClassName`, `invalidCell` state).
 *
 * Runtime coverage:
 *   - inline-line-min-value.mocked.spec.js  → typing -1 surfaces toast + red border
 *   - inline-lines-behavior.mocked.spec.js  → autosave still works on the happy path
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InlineLinesPanel.jsx'), 'utf8');

describe('InlineLinesPanel — min-value validation (ETP-4005)', () => {
  // ── Pure helpers ──────────────────────────────────────────────────────────

  it('declares the isValueBelowMin helper', () => {
    assert.match(src, /function isValueBelowMin\s*\(\s*col\s*,\s*value\s*\)/);
  });

  it('isValueBelowMin returns false when col.min is undefined', () => {
    // The very first guard skips columns without an explicit min.
    assert.match(src, /col\.min === undefined/);
    assert.match(src, /value === ''/);
    assert.match(src, /value == null/);
  });

  it('isValueBelowMin parses the value with parseFloat and compares to col.min', () => {
    assert.match(src, /parseFloat\(value\)/);
    assert.match(src, /num\s*<\s*col\.min/);
  });

  it('isValueBelowMin rejects NaN explicitly so empty / non-numeric input does not trip the check', () => {
    assert.match(src, /!isNaN\(num\)/);
  });

  it('declares the editInputClassName helper', () => {
    assert.match(src, /function editInputClassName\s*\(\s*isNumeric\s*,\s*isInvalid\s*\)/);
  });

  it('editInputClassName toggles border-red-500 when isInvalid is true', () => {
    assert.match(src, /isInvalid\s*\?\s*'border-red-500 focus-visible:ring-red-500'\s*:\s*'border-input'/);
  });

  it('editInputClassName keeps the white background and numeric alignment', () => {
    assert.match(src, /h-7 px-2 text-sm bg-white/);
    assert.match(src, /isNumeric \? ' text-right tabular-nums' : ''/);
  });

  // ── commitField wiring ────────────────────────────────────────────────────

  it('commitField calls isValueBelowMin BEFORE invoking onUpdateRow', () => {
    // The validator must short-circuit the PATCH — otherwise an invalid cell
    // would still travel to the backend.
    const commit = src.match(/const commitField = useCallback\([\s\S]*?\}, \[/);
    assert.ok(commit, 'commitField block not found');
    const block = commit[0];
    const minCheckIdx = block.indexOf('isValueBelowMin(col, value)');
    const onUpdateIdx = block.indexOf('onUpdateRow?.(');
    assert.ok(minCheckIdx > -1, 'isValueBelowMin call missing in commitField');
    assert.ok(onUpdateIdx > -1, 'onUpdateRow call missing in commitField');
    assert.ok(minCheckIdx < onUpdateIdx, 'isValueBelowMin must be checked before PATCH');
  });

  it('sets invalidCell state with rowId+colKey when validation fails', () => {
    assert.match(src, /setInvalidCell\(\{ rowId: row\.id, colKey: col\.key \}\)/);
  });

  it('emits the translated fieldMinValueError toast (no hardcoded English/Spanish)', () => {
    assert.match(src, /toast\.error\(ui\('fieldMinValueError'\)\)/);
    assert.doesNotMatch(src, /toast\.error\(['"`]Value cannot be negative/);
    assert.doesNotMatch(src, /toast\.error\(['"`]El valor no puede ser negativo/);
  });

  it('sets hasValidationErrorRef.current = true so the outside-click handler keeps edit mode open', () => {
    // Without this flag the row would auto-close on next mousedown — the user
    // would lose the chance to correct the invalid value.
    assert.match(src, /hasValidationErrorRef\.current = true;/);
    assert.match(src, /if \(hasValidationErrorRef\.current\) return;/);
  });

  it('does not call onUpdateRow when isValueBelowMin returns true', () => {
    // The early `return;` after toast.error must precede the onUpdateRow call.
    const commit = src.match(/if \(isValueBelowMin\(col, value\)\) \{[\s\S]*?\}\s*(?:const effectiveValue[\s\S]*?)?\s*pendingEditRef/);
    assert.ok(commit, 'min-check + return block not found before pendingEditRef');
    assert.match(commit[0], /toast\.error\(ui\('fieldMinValueError'\)\);\s*return;/);
  });

  // ── EditCell propagates the invalid flag ──────────────────────────────────

  it('EditCell receives an isInvalid prop derived from invalidCell', () => {
    assert.match(src, /isInvalid=\{invalidCell\?\.rowId === row\.id && invalidCell\?\.colKey === col\.key\}/);
  });

  it('EditCell forwards isInvalid into editInputClassName', () => {
    assert.match(src, /className=\{editInputClassName\(isNumeric, isInvalid\)\}/);
  });

  it('invalidCell is reset on a successful commit (next commitField run)', () => {
    // commitField clears the invalid marker at the top so a corrected value
    // wipes the red border the next time the cell is re-validated.
    assert.match(src, /hasValidationErrorRef\.current = false;\s*\n\s*setInvalidCell\(null\);/);
  });
});
