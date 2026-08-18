import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalloutFormState,
  extractAuxValues,
  normalizeCalloutQty,
  normalizeCalloutResponse,
  applyQtyZeroGuard,
  resetDescriptionOnProductChange,
  roundAmounts,
  shouldFireCascade,
  buildCascadeState,
  selectCascadeField,
  resolveSnapshotIdentifiers,
} from '../lineFieldChange.js';

// ─── buildCalloutFormState ────────────────────────────────────────────────────

describe('buildCalloutFormState', () => {

  it('merges header fields not present in row', () => {
    const row    = { product: 'P1', unitPrice: 10 };
    const header = { priceList: 'PL1', businessPartner: 'BP1', unitPrice: 99 };
    const result = buildCalloutFormState(row, header);
    assert.equal(result.priceList, 'PL1');
    assert.equal(result.businessPartner, 'BP1');
  });

  it('row values win over header when key exists in row', () => {
    const result = buildCalloutFormState({ unitPrice: 10 }, { unitPrice: 99 });
    assert.equal(result.unitPrice, 10);
  });

  it('excludes null header values', () => {
    const result = buildCalloutFormState({}, { currency: null, org: '' });
    assert.equal('currency' in result, false);
    assert.equal('org' in result, false);
  });

  it('does not mutate original row', () => {
    const row = { product: 'P1' };
    buildCalloutFormState(row, { extra: 'X' });
    assert.equal('extra' in row, false);
  });

  it('handles empty header gracefully', () => {
    const result = buildCalloutFormState({ product: 'P1' }, {});
    assert.deepEqual(result, { product: 'P1' });
  });

  it('[corner] row false value wins over header truthy value', () => {
    const result = buildCalloutFormState({ flag: false }, { flag: true });
    assert.equal(result.flag, false);
  });

  it('[corner] row zero value wins over header non-zero value', () => {
    const result = buildCalloutFormState({ discount: 0 }, { discount: 50 });
    assert.equal(result.discount, 0);
  });

  it('[corner] excludes undefined header values', () => {
    const result = buildCalloutFormState({}, { org: undefined });
    assert.equal('org' in result, false);
  });

});

// ─── extractAuxValues ─────────────────────────────────────────────────────────

describe('extractAuxValues', () => {

  it('extracts product_PSTD, product_UOM and similar aux keys', () => {
    const formState = { product: 'P1', product_PSTD: '44.00', product_UOM: '100', unitPrice: 44 };
    const aux = extractAuxValues(formState);
    assert.equal(aux.product_PSTD, '44.00');
    assert.equal(aux.product_UOM, '100');
    assert.equal('product' in aux, false);
    assert.equal('unitPrice' in aux, false);
  });

  it('coerces numeric aux values to string', () => {
    const aux = extractAuxValues({ product_PSTD: 44 });
    assert.equal(aux.product_PSTD, '44');
  });

  it('excludes null and empty string aux values', () => {
    const aux = extractAuxValues({ product_PSTD: null, product_UOM: '' });
    assert.equal(Object.keys(aux).length, 0);
  });

  it('returns empty object when no aux keys present', () => {
    assert.deepEqual(extractAuxValues({ unitPrice: 10, tax: 'TAX-1' }), {});
  });

  it('[corner] key with 5-char uppercase suffix does not match', () => {
    const aux = extractAuxValues({ product_PSTDO: 'x' });
    assert.equal('product_PSTDO' in aux, false);
  });

  it('[corner] key with 1-char uppercase suffix does not match', () => {
    const aux = extractAuxValues({ product_P: 'x' });
    assert.equal('product_P' in aux, false);
  });

});

// ─── normalizeCalloutQty ──────────────────────────────────────────────────────

describe('normalizeCalloutQty', () => {

  it('substitutes orderedQuantity=1 when qty is 0', () => {
    assert.equal(normalizeCalloutQty({ orderedQuantity: 0, unitPrice: 10 }).orderedQuantity, 1);
  });

  it('substitutes when orderedQuantity is missing', () => {
    assert.equal(normalizeCalloutQty({ unitPrice: 10 }).orderedQuantity, 1);
  });

  it('keeps existing positive quantity', () => {
    assert.equal(normalizeCalloutQty({ orderedQuantity: 3 }).orderedQuantity, 3);
  });

  it('does not mutate original object', () => {
    const original = { orderedQuantity: 0 };
    normalizeCalloutQty(original);
    assert.equal(original.orderedQuantity, 0);
  });

  it('[corner] string "0" is substituted', () => {
    assert.equal(normalizeCalloutQty({ orderedQuantity: '0' }).orderedQuantity, 1);
  });

  it('[corner] null is substituted', () => {
    assert.equal(normalizeCalloutQty({ orderedQuantity: null }).orderedQuantity, 1);
  });

});

// ─── normalizeCalloutResponse ─────────────────────────────────────────────────

describe('normalizeCalloutResponse', () => {

  it('happy path — maps updates to flat result', () => {
    const calloutData = {
      updates: {
        unitPrice: { value: 44 },
        tax: { value: 'TAX-21', _identifier: 'IVA Normal' },
      },
    };
    const result = normalizeCalloutResponse(calloutData, {});
    assert.equal(result.unitPrice, 44);
    assert.equal(result.tax, 'TAX-21');
    assert.equal(result['tax$_identifier'], 'IVA Normal');
  });

  it('maps combo selected values', () => {
    const calloutData = { combos: { uOM: { selected: '100', _identifier: 'Unit' } } };
    const result = normalizeCalloutResponse(calloutData, {});
    assert.equal(result.uOM, '100');
    assert.equal(result['uOM$_identifier'], 'Unit');
  });

  it('UUID guard: skips empty-string update when existing is 32-char hex UUID', () => {
    const calloutData = { updates: { tax: { value: '' } } };
    const result = normalizeCalloutResponse(calloutData, { tax: 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4' });
    assert.equal('tax' in result, false);
  });

  it('UUID guard: applies empty-string update for non-UUID fields', () => {
    const result = normalizeCalloutResponse({ updates: { discount: { value: '' } } }, { discount: 10 });
    assert.equal(result.discount, '');
  });

  it('UUID guard: applies empty update when existing value is not UUID-shaped', () => {
    const result = normalizeCalloutResponse({ updates: { description: { value: '' } } }, { description: 'old text' });
    assert.equal(result.description, '');
  });

  it('combo guard: skips empty selected (no-change signal)', () => {
    const result = normalizeCalloutResponse({ combos: { tax: { selected: '' } } }, {});
    assert.equal('tax' in result, false);
  });

  it('combo guard: skips null selected', () => {
    const result = normalizeCalloutResponse({ combos: { tax: { selected: null } } }, {});
    assert.equal('tax' in result, false);
  });

  it('handles missing updates and combos gracefully', () => {
    assert.deepEqual(normalizeCalloutResponse({}, {}), {});
  });

  it('accepts standard UUID format with dashes', () => {
    const calloutData = { updates: { tax: { value: '' } } };
    const result = normalizeCalloutResponse(calloutData, { tax: '867FFFAC-82CC-4406-9FE6-497E4C5C6348' });
    assert.equal('tax' in result, false);
  });

  it('[corner] numeric 0 value is applied (not guarded)', () => {
    const result = normalizeCalloutResponse({ updates: { discount: { value: 0 } } }, { discount: 17 });
    assert.equal(result.discount, 0);
  });

  it('[corner] all-zeros 32-char hex UUID triggers guard', () => {
    const calloutData = { updates: { tax: { value: '' } } };
    const result = normalizeCalloutResponse(calloutData, { tax: '00000000000000000000000000000000' });
    assert.equal('tax' in result, false);
  });

  it('[corner] combo value overwrites update value for same key', () => {
    const calloutData = {
      updates: { tax: { value: 'FROM-UPDATE' } },
      combos:  { tax: { selected: 'FROM-COMBO' } },
    };
    const result = normalizeCalloutResponse(calloutData, {});
    assert.equal(result.tax, 'FROM-COMBO');
  });

  it('[corner] UUID guard also suppresses _identifier', () => {
    const calloutData = { updates: { tax: { value: '', _identifier: 'Should not appear' } } };
    const result = normalizeCalloutResponse(calloutData, { tax: 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4' });
    assert.equal('tax' in result, false);
    assert.equal('tax$_identifier' in result, false);
  });

});

// ─── applyQtyZeroGuard ────────────────────────────────────────────────────────

describe('applyQtyZeroGuard', () => {

  it('deletes orderedQuantity=0 when row already has a positive value', () => {
    const result    = { orderedQuantity: 0 };
    const rowValues = { orderedQuantity: 3 };
    applyQtyZeroGuard(result, rowValues);
    assert.equal('orderedQuantity' in result, false);
  });

  it('deletes invoicedQuantity=0 when row has positive value', () => {
    const result    = { invoicedQuantity: 0 };
    const rowValues = { invoicedQuantity: 5 };
    applyQtyZeroGuard(result, rowValues);
    assert.equal('invoicedQuantity' in result, false);
  });

  it('keeps orderedQuantity=0 when row has no prior positive quantity', () => {
    const result    = { orderedQuantity: 0 };
    const rowValues = { orderedQuantity: 0 };
    applyQtyZeroGuard(result, rowValues);
    assert.equal(result.orderedQuantity, 0);
  });

  it('does not touch non-qty fields', () => {
    const result    = { unitPrice: 0, discount: 0 };
    const rowValues = { unitPrice: 10, discount: 20 };
    applyQtyZeroGuard(result, rowValues);
    assert.equal(result.unitPrice, 0);
    assert.equal(result.discount, 0);
  });

  it('handles missing qty fields in result without throwing', () => {
    assert.doesNotThrow(() => applyQtyZeroGuard({}, { orderedQuantity: 3 }));
  });

  it('[corner] string "0" in result does NOT trigger guard (strict equality)', () => {
    const result    = { orderedQuantity: '0' };
    const rowValues = { orderedQuantity: 3 };
    applyQtyZeroGuard(result, rowValues);
    assert.equal('orderedQuantity' in result, true);
  });

  it('[corner] string row quantity triggers guard', () => {
    const result    = { orderedQuantity: 0 };
    const rowValues = { orderedQuantity: '3' };
    applyQtyZeroGuard(result, rowValues);
    assert.equal('orderedQuantity' in result, false);
  });

  it('[corner] movementQuantity is guarded', () => {
    const result    = { movementQuantity: 0 };
    const rowValues = { movementQuantity: 2 };
    applyQtyZeroGuard(result, rowValues);
    assert.equal('movementQuantity' in result, false);
  });

});

// ─── resetDescriptionOnProductChange ──────────────────────────────────────────

describe('resetDescriptionOnProductChange', () => {

  it('resets description to empty string when product changes and callout omitted it', () => {
    const result = {};
    resetDescriptionOnProductChange(result, 'product');
    assert.equal(result.description, '');
  });

  it('does not overwrite a description the callout already returned', () => {
    const result = { description: 'From callout' };
    resetDescriptionOnProductChange(result, 'product');
    assert.equal(result.description, 'From callout');
  });

  it('does nothing when the changed field is not product', () => {
    const result = { unitPrice: 44 };
    resetDescriptionOnProductChange(result, 'unitPrice');
    assert.equal('description' in result, false);
  });

  it('[corner] empty-string description from callout is preserved (not re-reset)', () => {
    const result = { description: '' };
    resetDescriptionOnProductChange(result, 'product');
    assert.equal(result.description, '');
  });

  it('[corner] explicit null description is treated as absent and reset', () => {
    const result = { description: null };
    resetDescriptionOnProductChange(result, 'product');
    assert.equal(result.description, '');
  });

});

// ─── roundAmounts ─────────────────────────────────────────────────────────────

describe('roundAmounts', () => {

  it('rounds grossAmount to 2 decimal places', () => {
    const result = { grossAmount: 12.0879 };
    roundAmounts(result);
    assert.equal(result.grossAmount, 12.09);
  });

  it('rounds lineGrossAmount', () => {
    const result = { lineGrossAmount: 23.1049 };
    roundAmounts(result);
    assert.equal(result.lineGrossAmount, 23.10);
  });

  it('rounds lineNetAmount', () => {
    const result = { lineNetAmount: 19.085 };
    roundAmounts(result);
    assert.equal(result.lineNetAmount, 19.09);
  });

  it('skips null/undefined amount fields', () => {
    const result = { grossAmount: null };
    roundAmounts(result);
    assert.equal(result.grossAmount, null);
  });

  it('does not affect unrelated fields', () => {
    const result = { unitPrice: 44.999, grossAmount: 54.4499 };
    roundAmounts(result);
    assert.equal(result.unitPrice, 44.999);
    assert.equal(result.grossAmount, 54.45);
  });

  it('[corner] string amount is coerced and rounded', () => {
    const result = { grossAmount: '12.0879' };
    roundAmounts(result);
    assert.equal(result.grossAmount, 12.09);
  });

  it('[corner] NaN amount stays NaN', () => {
    const result = { grossAmount: NaN };
    roundAmounts(result);
    assert.ok(Number.isNaN(result.grossAmount));
  });

});

// ─── shouldFireCascade ────────────────────────────────────────────────────────

describe('shouldFireCascade', () => {

  it('returns true when unitPrice present and lineNetAmount absent', () => {
    assert.equal(shouldFireCascade({ unitPrice: 44 }), true);
  });

  it('returns true when grossUnitPrice present and lineNetAmount absent', () => {
    assert.equal(shouldFireCascade({ grossUnitPrice: 53.24 }), true);
  });

  it('returns false when lineNetAmount is already set', () => {
    assert.equal(shouldFireCascade({ unitPrice: 44, lineNetAmount: 44 }), false);
  });

  it('returns false when lineNetAmt (OBDal variant) is set', () => {
    assert.equal(shouldFireCascade({ unitPrice: 44, lineNetAmt: 44 }), false);
  });

  it('returns false when no price field was updated', () => {
    assert.equal(shouldFireCascade({ tax: 'TAX-21', discount: 0 }), false);
  });

  it('returns true when lineNetAmount is 0 (not computed)', () => {
    assert.equal(shouldFireCascade({ unitPrice: 44, lineNetAmount: 0 }), true);
  });

  it('[corner] lineNetAmt string "0" still fires cascade', () => {
    assert.equal(shouldFireCascade({ unitPrice: 44, lineNetAmt: '0' }), true);
  });

  it('[corner] lineNetAmount null fires cascade', () => {
    assert.equal(shouldFireCascade({ unitPrice: 44, lineNetAmount: null }), true);
  });

});

// ─── buildCascadeState ────────────────────────────────────────────────────────

describe('buildCascadeState', () => {

  it('merges primary result fields into form state', () => {
    const state = buildCascadeState(
      { tax: 'TAX-21', unitPrice: 44 },
      { orderedQuantity: 2, priceList: 'PL1' },
    );
    assert.equal(state.tax, 'TAX-21');
    assert.equal(state.unitPrice, 44);
    assert.equal(state.orderedQuantity, 2);
    assert.equal(state.priceList, 'PL1');
  });

  it('excludes $_identifier fields from cascade state', () => {
    const state = buildCascadeState({ 'tax$_identifier': 'IVA Normal', tax: 'TAX-21' }, {});
    assert.equal('tax$_identifier' in state, false);
    assert.equal(state.tax, 'TAX-21');
  });

  it('primary result overrides form state values', () => {
    const state = buildCascadeState({ unitPrice: 44 }, { unitPrice: 0 });
    assert.equal(state.unitPrice, 44);
  });

  it('does not mutate the original formState', () => {
    const formState = { orderedQuantity: 2 };
    buildCascadeState({ tax: 'TAX-21' }, formState);
    assert.equal('tax' in formState, false);
  });

  it('[corner] empty primaryResult returns copy of formState', () => {
    const formState = { unitPrice: 44, orderedQuantity: 2 };
    const state = buildCascadeState({}, formState);
    assert.deepEqual(state, formState);
    assert.notEqual(state, formState);
  });

});

// ─── selectCascadeField ───────────────────────────────────────────────────────

describe('selectCascadeField', () => {

  it('uses grossUnitPrice column for tax-inclusive price lists', () => {
    const { field, value } = selectCascadeField(
      { grossUnitPrice: 53.24 },
      [{ key: 'grossUnitPrice', column: 'inpgrossUnitPrice' }],
    );
    assert.equal(field, 'inpgrossUnitPrice');
    assert.equal(value, '53.24');
  });

  it('falls back to default gross column name when not in addLineFields', () => {
    const { field } = selectCascadeField({ grossUnitPrice: 53.24 }, []);
    assert.equal(field, 'inpgrossUnitPrice');
  });

  it('uses unitPrice column for net price lists', () => {
    const { field, value } = selectCascadeField(
      { unitPrice: 44, netUnitPrice: 44 },
      [{ key: 'unitPrice', column: 'PriceActual' }],
    );
    assert.equal(field, 'PriceActual');
    assert.equal(value, '44');
  });

  it('prefers netUnitPrice over unitPrice as cascade value', () => {
    const { value } = selectCascadeField({ unitPrice: 53.24, netUnitPrice: 44 }, []);
    assert.equal(value, '44');
  });

  it('falls back to default unitPrice column name when not in addLineFields', () => {
    const { field } = selectCascadeField({ unitPrice: 44 }, []);
    assert.equal(field, 'PriceActual');
  });

  it('[corner] null addLineFields falls back to defaults', () => {
    const { field: gField } = selectCascadeField({ grossUnitPrice: 10 }, null);
    assert.equal(gField, 'inpgrossUnitPrice');
    const { field: nField } = selectCascadeField({ unitPrice: 10 }, null);
    assert.equal(nField, 'PriceActual');
  });

  it('[corner] grossUnitPrice=0 takes GROSS path because check is != null, not truthy', () => {
    const { field } = selectCascadeField({ grossUnitPrice: 0, unitPrice: 44 }, []);
    assert.equal(field, 'inpgrossUnitPrice');
  });

});

// ─── resolveSnapshotIdentifiers ───────────────────────────────────────────────

describe('resolveSnapshotIdentifiers', () => {

  it('fills missing $_identifier from snapshot hint', () => {
    const result    = { uOM: '100' };
    const rowValues = { product_uOM: 'Unit' };
    resolveSnapshotIdentifiers(result, 'product', rowValues);
    assert.equal(result['uOM$_identifier'], 'Unit');
  });

  it('does not overwrite an existing $_identifier', () => {
    const result    = { uOM: '100', 'uOM$_identifier': 'Box' };
    const rowValues = { product_uOM: 'Unit' };
    resolveSnapshotIdentifiers(result, 'product', rowValues);
    assert.equal(result['uOM$_identifier'], 'Box');
  });

  it('skips $_identifier keys in the result object', () => {
    const result    = { 'tax$_identifier': 'IVA Normal' };
    const rowValues = { 'product_tax$_identifier': 'Other' };
    resolveSnapshotIdentifiers(result, 'product', rowValues);
    assert.equal('tax$_identifier$_identifier' in result, false);
  });

  it('ignores missing hint gracefully', () => {
    const result = { uOM: '100' };
    resolveSnapshotIdentifiers(result, 'product', {});
    assert.equal('uOM$_identifier' in result, false);
  });

  it('ignores non-string hints', () => {
    const result    = { uOM: '100' };
    const rowValues = { product_uOM: 42 };
    resolveSnapshotIdentifiers(result, 'product', rowValues);
    assert.equal('uOM$_identifier' in result, false);
  });

});
