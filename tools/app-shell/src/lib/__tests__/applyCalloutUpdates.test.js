import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyCalloutUpdates } from '../applyCalloutUpdates.js';

const noForce  = new Set();
const noTouch  = new Set();

describe('applyCalloutUpdates — normal guard (touched field preserved)', () => {
  it('applies callout value to an untouched field', () => {
    const prev    = { quantityCount: '', bookQuantity: '' };
    const updates = { quantityCount: 300, bookQuantity: 300 };
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', noTouch);
    assert.equal(result.quantityCount, 300);
    assert.equal(result.bookQuantity, 300);
  });

  it('preserves a touched field with a user value', () => {
    const prev    = { quantityCount: 50, bookQuantity: '' };
    const updates = { quantityCount: 300, bookQuantity: 300 };
    const touched = new Set(['quantityCount']);
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', touched);
    assert.equal(result.quantityCount, 50,  'touched field should be preserved');
    assert.equal(result.bookQuantity,  300, 'untouched field should be updated');
  });

  it('does not overwrite a non-empty field with empty/null', () => {
    const prev    = { quantityCount: 50 };
    const updates = { quantityCount: '' };
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', noTouch);
    assert.equal(result.quantityCount, 50);
  });

  it('does not overwrite a non-empty field with null', () => {
    const prev    = { quantityCount: 50 };
    const updates = { quantityCount: null };
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', noTouch);
    assert.equal(result.quantityCount, 50);
  });

  it('always applies callout value to the trigger field itself', () => {
    const prev    = { product: 'old-id' };
    const updates = { product: 'new-id' };
    const touched = new Set(['product']);
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', touched);
    assert.equal(result.product, 'new-id');
  });
});

describe('applyCalloutUpdates — forceFields bypass', () => {
  it('overwrites a touched field when it is in forceFields', () => {
    const prev      = { quantityCount: 50, bookQuantity: 100 };
    const updates   = { quantityCount: 300, bookQuantity: 300 };
    const touched   = new Set(['quantityCount', 'bookQuantity']);
    const forced    = new Set(['quantityCount', 'bookQuantity']);
    const result    = applyCalloutUpdates(prev, updates, forced, 'product', touched);
    assert.equal(result.quantityCount, 300, 'forced field should be overwritten');
    assert.equal(result.bookQuantity,  300, 'forced field should be overwritten');
  });

  it('overwrites with empty/null when field is in forceFields', () => {
    const prev    = { quantityCount: 50 };
    const updates = { quantityCount: '' };
    const forced  = new Set(['quantityCount']);
    const result  = applyCalloutUpdates(prev, updates, forced, 'product', noTouch);
    assert.equal(result.quantityCount, '');
  });

  it('only forces the declared fields — other touched fields still protected', () => {
    const prev    = { quantityCount: 50, description: 'my note' };
    const updates = { quantityCount: 300, description: 'auto desc' };
    const touched = new Set(['quantityCount', 'description']);
    const forced  = new Set(['quantityCount']);
    const result  = applyCalloutUpdates(prev, updates, forced, 'product', touched);
    assert.equal(result.quantityCount, 300,       'forced field overwritten');
    assert.equal(result.description,   'my note', 'non-forced touched field preserved');
  });
});

describe('applyCalloutUpdates — edge cases', () => {
  it('returns a new object (does not mutate prev)', () => {
    const prev    = { quantityCount: 50 };
    const updates = { quantityCount: 300 };
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', noTouch);
    assert.equal(prev.quantityCount, 50, 'prev must not be mutated');
    assert.equal(result.quantityCount, 300);
  });

  it('applies update when prev field is empty string (no user value)', () => {
    const prev    = { quantityCount: '' };
    const updates = { quantityCount: 300 };
    const touched = new Set(['quantityCount']);
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', touched);
    assert.equal(result.quantityCount, 300, 'empty string is not a user value — callout wins');
  });

  it('applies update when prev field is null (no user value)', () => {
    const prev    = { quantityCount: null };
    const updates = { quantityCount: 300 };
    const touched = new Set(['quantityCount']);
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', touched);
    assert.equal(result.quantityCount, 300, 'null is not a user value — callout wins');
  });

  it('handles empty updates gracefully', () => {
    const prev   = { quantityCount: 50 };
    const result = applyCalloutUpdates(prev, {}, noForce, 'product', noTouch);
    assert.deepStrictEqual(result, prev);
  });
});

describe('applyCalloutUpdates — $_identifier companion inherits base-key rules (ETP-5039)', () => {
  it('THE BUG: a drawer-picked label survives a parallel callout on the base field', () => {
    const prev    = { storageBin: 'BIN1', 'storageBin$_identifier': 'Almacén Secundario' };
    const updates = { storageBin: 'BIN1', 'storageBin$_identifier': 'AS-0-0-0' };
    const touched = new Set(['product', 'storageBin']);
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', touched);
    assert.equal(
      result['storageBin$_identifier'],
      'Almacén Secundario',
      'the label the user picked in the drawer must not be overwritten by the callout',
    );
  });

  it('INVERSE: an untouched base field still lets the callout update both value and label', () => {
    const prev    = { storageBin: 'BIN1', 'storageBin$_identifier': 'Almacén Secundario' };
    const updates = { storageBin: 'BIN1', 'storageBin$_identifier': 'AS-0-0-0' };
    const touched = new Set(['product']); // user never picked the bin
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', touched);
    assert.equal(result.storageBin, 'BIN1');
    assert.equal(result['storageBin$_identifier'], 'AS-0-0-0');
  });

  it('a forced base field also forces its $_identifier companion (e.g. tax/uOM)', () => {
    const prev    = { tax: 'T1', 'tax$_identifier': 'Old Tax' };
    const updates = { tax: 'T2', 'tax$_identifier': 'New Tax' };
    const touched = new Set(['tax']);
    const forced  = new Set(['tax']); // real contracts only declare the base key
    const result  = applyCalloutUpdates(prev, updates, forced, 'product', touched);
    assert.equal(result.tax, 'T2');
    assert.equal(result['tax$_identifier'], 'New Tax');
  });

  it('does not treat a field whose name merely contains a touched key as its companion', () => {
    const prev    = { taxAmount: 1 };
    const updates = { taxAmount: 99 };
    const touched = new Set(['tax']);
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', touched);
    assert.equal(result.taxAmount, 99, 'taxAmount is not the $_identifier companion of tax');
  });

  it('sales-order witness: an untouched autocompleted price is still recalculated', () => {
    const prev    = { unitPrice: 10 };
    const updates = { unitPrice: 25 };
    const touched = new Set(['product']);
    const result  = applyCalloutUpdates(prev, updates, noForce, 'product', touched);
    assert.equal(result.unitPrice, 25);
  });
});
