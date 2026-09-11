/**
 * Accounting-dimension gating helpers (ETP-4950).
 *
 * Covers the column -> dimension-key mapping (contact included, see below), the deliberately
 * narrower `FETCH_TRIGGER_COLUMNS` subset that decides whether a form is worth a request at all,
 * and the three branches of `filterByActiveDimensions` — including the fail-open branch, which is
 * the one that must never regress: hiding a field the user configured is worse than briefly
 * showing one they cannot use.
 *
 * Two invariants here are non-obvious and are pinned on purpose:
 *  - `C_BPartner_ID` IS a gated dimension. On a matching rule the contact is *assigned* to the
 *    generated movement, not matched on (the engine only matches `textPattern`), so it is gated
 *    exactly like project, cost centre and product.
 *  - `C_BPartner_ID` is NOT a fetch trigger. It appears on dozens of windows that never implement
 *    `?action=activeDimensions`, so letting it trigger the request would 404 on all of them.
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
  it('maps exactly the four document dimensions Etendo GO exposes', () => {
    assert.deepEqual(DIMENSION_KEY_BY_COLUMN, {
      C_PROJECT_ID: 'project',
      C_COSTCENTER_ID: 'costcenter',
      M_PRODUCT_ID: 'product',
      C_BPARTNER_ID: 'bpartner',
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

  it('resolves C_BPartner_ID as the contact dimension (it is assigned, not matched on)', () => {
    // This used to return null on the theory that "on a matching rule the contact is a matching
    // criterion". It is not: `MatchRuleEngine#matches` only ever matches on `textPattern`, and the
    // rule's contact is *assigned* to the movement it generates — exactly like project, cost centre
    // and product. So it is gated like them.
    assert.equal(dimensionKeyOf({ column: 'C_BPartner_ID' }), 'bpartner');
    assert.equal(dimensionKeyOf({ column: 'c_bpartner_id' }), 'bpartner');
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

  it('is true for the cost centre and product columns too', () => {
    assert.equal(hasDimensionFields([{ column: 'C_Costcenter_ID' }]), true);
    assert.equal(hasDimensionFields([{ column: 'm_product_id' }]), true);
  });

  it('is false when no descriptor is a dimension', () => {
    const fields = [{ column: 'Name' }, { column: 'C_BPartner_ID' }, { key: 'noColumn' }];
    assert.equal(hasDimensionFields(fields), false);
  });

  it('does NOT let C_BPartner_ID alone trigger the activeDimensions request', () => {
    // DELIBERATE and load-bearing: the contact IS a gated dimension (see `dimensionKeyOf` above),
    // but it is NOT a fetch trigger. `C_BPartner_ID` appears on dozens of windows that do not
    // implement `?action=activeDimensions`; if it triggered the fetch, every one of them would
    // fire a request that 404s. A form carrying a real dimension already triggers the fetch, and
    // once the answer is in `filterByActiveDimensions` gates the contact too. Do not "simplify"
    // `hasDimensionFields` back to `DIMENSION_KEY_BY_COLUMN`.
    assert.equal(hasDimensionFields([{ column: 'C_BPartner_ID' }]), false);
    assert.equal(hasDimensionFields([{ column: 'c_bpartner_id' }]), false);
    // ...but a real dimension alongside it does trigger it.
    assert.equal(
      hasDimensionFields([{ column: 'C_BPartner_ID' }, { column: 'C_Project_ID' }]),
      true,
    );
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
    assert.deepEqual(kept.map(f => f.key), ['name', 'product']);
  });

  it('keeps all four when all four are active', () => {
    const kept = filterByActiveDimensions(FIELDS, ['product', 'project', 'costcenter', 'bpartner']);
    assert.deepEqual(kept.map(f => f.key), FIELDS.map(f => f.key));
  });

  it('keeps the contact field when bpartner IS among the active dimensions', () => {
    const kept = filterByActiveDimensions(FIELDS, ['bpartner']);
    assert.deepEqual(kept.map(f => f.key), ['name', 'bpartner']);
  });

  it('drops the contact field when bpartner is NOT among the active dimensions', () => {
    // The contact is gated like any other dimension: a tenant that switched Business Partner off
    // in the Accounting Schema must not see it on the rule form.
    const kept = filterByActiveDimensions(FIELDS, ['project', 'costcenter', 'product']);
    assert.deepEqual(kept.map(f => f.key), ['name', 'product', 'project', 'costcenter']);
  });

  it('hides every dimension on an empty active list, keeping non-dimension fields', () => {
    const kept = filterByActiveDimensions(FIELDS, []);
    assert.deepEqual(kept.map(f => f.key), ['name']);
  });

  it('ignores active keys that no field represents', () => {
    const kept = filterByActiveDimensions(FIELDS, ['organization', 'project']);
    assert.deepEqual(kept.map(f => f.key), ['name', 'project']);
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
