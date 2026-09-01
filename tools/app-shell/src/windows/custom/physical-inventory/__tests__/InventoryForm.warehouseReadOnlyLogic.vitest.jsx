// QA follow-up for ETP-5052 (post-review, Sentinel).
//
// The existing coverage for the header `hasLines` lock — detailViewHelpers.vitest.js's
// `buildHeaderFormData` suite and DetailView.headerHasLinesLock.vitest.jsx — both exercise
// the GENERIC mechanism against a hardcoded `readOnlyLogic: (record) => !!record.hasLines`
// fixture. Neither ever imports the real generated artifact, so neither ever runs the
// SPECIFIC expression that actually ships to Physical Inventory's `warehouse` field:
//
//   decisions.json: "readOnlyLogicJs": "!!record.hasLines || record.processed === true"
//   compiled to:    readOnlyLogic: (record) => !!record.hasLines || record.processed === true
//
// This closes that gap: it imports the ACTUAL compiled `InventoryForm.fields` array
// (via the same `@generated` alias real windows use) and runs the warehouse field's
// `readOnlyLogic` through the full 2x2 truth table of `hasLines` x `processed`. A
// regression that drops the `|| record.processed === true` disjunct (exactly what
// happened once already in this ticket's history, per the reviewer's note) would fail
// this test even though it would NOT fail the generic-mechanism suites above.
import { describe, expect, it } from 'vitest';
import InventoryForm from '@generated/physical-inventory/generated/web/physical-inventory/InventoryForm.jsx';

function warehouseField() {
  const field = InventoryForm.fields.find((f) => f.key === 'warehouse');
  if (!field) throw new Error('warehouse field not found in InventoryForm.fields — has the artifact been regenerated?');
  return field;
}

describe('Physical Inventory — warehouse readOnlyLogic compiled expression (ETP-5052)', () => {
  it('is compiled from decisions.json readOnlyLogicJs, not the legacy AD readOnlyLogic', () => {
    // Guards against a future regen silently reverting to a plain AD-derived
    // lock (or to no lock at all) without anyone noticing in this test file.
    expect(warehouseField().readOnlyLogic).toBeInstanceOf(Function);
  });

  it.each([
    { hasLines: false, processed: false, expected: false, label: 'no lines, not processed -> editable' },
    { hasLines: true, processed: false, expected: true, label: 'has lines, not processed -> locked' },
    { hasLines: false, processed: true, expected: true, label: 'no lines, processed -> locked' },
    { hasLines: true, processed: true, expected: true, label: 'has lines and processed -> locked' },
  ])('$label', ({ hasLines, processed, expected }) => {
    const readOnlyLogic = warehouseField().readOnlyLogic;
    expect(readOnlyLogic({ hasLines, processed })).toBe(expected);
  });

  it('does not lock on a falsy-but-defined hasLines (0, "", null, undefined)', () => {
    const readOnlyLogic = warehouseField().readOnlyLogic;
    for (const falsy of [0, '', null, undefined]) {
      expect(readOnlyLogic({ hasLines: falsy, processed: false })).toBe(false);
    }
  });

  it('does not lock when processed is a truthy non-boolean (e.g. the string "Y")', () => {
    // record.processed === true is a strict comparison — only a JS boolean
    // `true` should lock, matching how the rest of the header fields on this
    // same window (movementDate, name) compile their Processed-based lock.
    const readOnlyLogic = warehouseField().readOnlyLogic;
    expect(readOnlyLogic({ hasLines: false, processed: 'Y' })).toBe(false);
  });

  it('other header fields with a Processed-only lock are unaffected by the hasLines addition', () => {
    // Confirms the OR-expression was scoped to warehouse only — movementDate/name
    // keep the plain strict-equality lock, still driven only by `processed`.
    const movementDate = InventoryForm.fields.find((f) => f.key === 'movementDate');
    const name = InventoryForm.fields.find((f) => f.key === 'name');
    for (const field of [movementDate, name]) {
      expect(field.readOnlyLogic({ hasLines: true, processed: false })).toBe(false);
      expect(field.readOnlyLogic({ processed: true })).toBe(true);
    }
  });
});
