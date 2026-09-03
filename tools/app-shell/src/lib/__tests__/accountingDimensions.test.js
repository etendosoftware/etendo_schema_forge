/**
 * Accounting-dimension gating helpers (ETP-4950).
 *
 * Covers the column → dimension-key mapping, the deliberate exclusion of `C_BPartner_ID`, and the
 * three branches of `filterByActiveDimensions` — including the fail-open branch, which is the one
 * that must never regress: hiding a field the user configured is worse than briefly showing one
 * they cannot use.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIMENSION_KEY_BY_COLUMN,
  dimensionKeyOf,
  hasDimensionFields,
  filterByActiveDimensions,
} from '../accountingDimensions.js';

describe('DIMENSION_KEY_BY_COLUMN', () => {
  it('maps exactly the three document dimensions Etendo GO exposes', () => {
    assert.deepEqual(DIMENSION_KEY_BY_COLUMN, {
      C_PROJECT_ID: 'project',
      C_COSTCENTER_ID: 'costcenter',
      M_PRODUCT_ID: 'product',
    });
  });

  it('is frozen so a caller cannot extend the authoritative mapping at runtime', () => {
    assert.equal(Object.isFrozen(DIMENSION_KEY_BY_COLUMN), true);
  });
});

describe('dimensionKeyOf', () => {
  it('resolves the project column', () => {
    assert.equal(dimensionKeyOf({ column: 'C_Project_ID' }), 'project');
  });

  it('resolves the cost centre column', () => {
    assert.equal(dimensionKeyOf({ column: 'C_Costcenter_ID' }), 'costcenter');
  });

  it('resolves the product column', () => {
    assert.equal(dimensionKeyOf({ column: 'M_Product_ID' }), 'product');
  });

  it('is case-insensitive on the AD column name', () => {
    assert.equal(dimensionKeyOf({ column: 'c_project_id' }), 'project');
    assert.equal(dimensionKeyOf({ column: 'C_PROJECT_ID' }), 'project');
    assert.equal(dimensionKeyOf({ column: 'M_pRoDuCt_Id' }), 'product');
  });

  it('does NOT treat C_BPartner_ID as a dimension (deliberate — it is a matching criterion)', () => {
    assert.equal(dimensionKeyOf({ column: 'C_BPartner_ID' }), null);
  });

  it('returns null for a non-dimension column', () => {
    assert.equal(dimensionKeyOf({ column: 'Name' }), null);
    assert.equal(dimensionKeyOf({ column: 'C_Currency_ID' }), null);
  });

  it('returns null for a field with no column', () => {
    assert.equal(dimensionKeyOf({ key: 'name' }), null);
    assert.equal(dimensionKeyOf({ column: '' }), null);
    assert.equal(dimensionKeyOf({ column: null }), null);
  });

  it('returns null for a null/undefined field', () => {
    assert.equal(dimensionKeyOf(null), null);
    assert.equal(dimensionKeyOf(undefined), null);
  });

  it('does not resolve inherited Object properties as dimensions', () => {
    // `String(column).toUpperCase()` on e.g. 'constructor' must not hit Object.prototype.
    assert.equal(dimensionKeyOf({ column: 'constructor' }), null);
    assert.equal(dimensionKeyOf({ column: 'toString' }), null);
  });
});

describe('hasDimensionFields', () => {
  it('is true when at least one descriptor is a dimension', () => {
    const fields = [{ column: 'Name' }, { column: 'C_Project_ID' }];
    assert.equal(hasDimensionFields(fields), true);
  });

  it('is false when no descriptor is a dimension', () => {
    const fields = [{ column: 'Name' }, { column: 'C_BPartner_ID' }, { key: 'noColumn' }];
    assert.equal(hasDimensionFields(fields), false);
  });

  it('is false for an empty list', () => {
    assert.equal(hasDimensionFields([]), false);
  });

  it('is false for null/undefined (nothing to gate → no request)', () => {
    assert.equal(hasDimensionFields(null), false);
    assert.equal(hasDimensionFields(undefined), false);
  });
});

describe('filterByActiveDimensions', () => {
  const FIELDS = [
    { key: 'name', column: 'Name' },
    { key: 'product', column: 'M_Product_ID' },
    { key: 'project', column: 'C_Project_ID' },
    { key: 'costcenter', column: 'C_Costcenter_ID' },
    { key: 'bpartner', column: 'C_BPartner_ID' },
  ];

  it('keeps only the dimensions listed as active, plus every non-dimension field', () => {
    const kept = filterByActiveDimensions(FIELDS, ['product']);
    assert.deepEqual(kept.map(f => f.key), ['name', 'product', 'bpartner']);
  });

  it('keeps all three when all three are active', () => {
    const kept = filterByActiveDimensions(FIELDS, ['product', 'project', 'costcenter']);
    assert.deepEqual(kept.map(f => f.key), FIELDS.map(f => f.key));
  });

  it('hides all three dimensions on an empty active list, keeping non-dimension fields', () => {
    const kept = filterByActiveDimensions(FIELDS, []);
    assert.deepEqual(kept.map(f => f.key), ['name', 'bpartner']);
  });

  it('ignores active keys that no field represents', () => {
    const kept = filterByActiveDimensions(FIELDS, ['organization', 'project']);
    assert.deepEqual(kept.map(f => f.key), ['name', 'project', 'bpartner']);
  });

  it('fails open on null: returns the fields untouched (same array reference)', () => {
    const kept = filterByActiveDimensions(FIELDS, null);
    assert.equal(kept, FIELDS);
  });

  it('fails open on undefined: returns the fields untouched', () => {
    assert.equal(filterByActiveDimensions(FIELDS, undefined), FIELDS);
  });

  it('fails open on a non-array value (never filters on a malformed answer)', () => {
    assert.equal(filterByActiveDimensions(FIELDS, 'project'), FIELDS);
    assert.equal(filterByActiveDimensions(FIELDS, { project: true }), FIELDS);
    assert.equal(filterByActiveDimensions(FIELDS, 0), FIELDS);
  });

  it('returns an empty list for null fields with a known active list', () => {
    assert.deepEqual(filterByActiveDimensions(null, ['project']), []);
    assert.deepEqual(filterByActiveDimensions(undefined, []), []);
  });

  it('does not mutate the input array', () => {
    const input = [...FIELDS];
    filterByActiveDimensions(input, []);
    assert.equal(input.length, FIELDS.length);
  });
});
