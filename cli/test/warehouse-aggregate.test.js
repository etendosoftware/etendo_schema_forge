import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { aggregateProducts } from '../../tools/app-shell/src/windows/custom/warehouse/warehouseUtils.js';

describe('aggregateProducts', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(aggregateProducts([]), []);
  });

  it('returns empty array when all rows have zero qty', () => {
    const rows = [
      { product: 'P1', 'product$_identifier': 'Widget', uOM: 'U1', quantityOnHand: 0 },
      { product: 'P2', 'product$_identifier': 'Gadget', uOM: 'U1', quantityOnHand: '0' },
    ];
    assert.deepEqual(aggregateProducts(rows), []);
  });

  it('aggregates qty across bins for the same product', () => {
    const rows = [
      { product: 'P1', 'product$_identifier': 'Widget', uOM: 'U1', quantityOnHand: 10 },
      { product: 'P1', 'product$_identifier': 'Widget', uOM: 'U1', quantityOnHand: 5 },
    ];
    const result = aggregateProducts(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].qty, 15);
  });

  it('keeps distinct products separate', () => {
    const rows = [
      { product: 'P1', 'product$_identifier': 'Widget', uOM: 'U1', quantityOnHand: 3 },
      { product: 'P2', 'product$_identifier': 'Gadget', uOM: 'U1', quantityOnHand: 7 },
    ];
    const result = aggregateProducts(rows);
    assert.equal(result.length, 2);
    assert.equal(result.find(p => p.id === 'P1').qty, 3);
    assert.equal(result.find(p => p.id === 'P2').qty, 7);
  });

  it('resolves uom label from uomMap when available', () => {
    const rows = [{ product: 'P1', uOM: 'U1', quantityOnHand: 1 }];
    const uomMap = { U1: 'Unidad' };
    const result = aggregateProducts(rows, uomMap);
    assert.equal(result[0].uom, 'Unidad');
  });

  it('falls back to uOM$_identifier when uomMap has no entry', () => {
    const rows = [{ product: 'P1', uOM: 'U1', 'uOM$_identifier': 'Each', quantityOnHand: 2 }];
    const result = aggregateProducts(rows);
    assert.equal(result[0].uom, 'Each');
  });

  it('falls back to raw uOM id when no translation available', () => {
    const rows = [{ product: 'P1', uOM: 'U1', quantityOnHand: 2 }];
    const result = aggregateProducts(rows);
    assert.equal(result[0].uom, 'U1');
  });

  it('uses "unknown" as id when product field is missing', () => {
    const rows = [{ quantityOnHand: 5 }];
    const result = aggregateProducts(rows);
    assert.equal(result[0].id, 'unknown');
  });

  it('uses product id as label when product$_identifier is missing', () => {
    const rows = [{ product: 'P1', quantityOnHand: 1 }];
    const result = aggregateProducts(rows);
    assert.equal(result[0].label, 'P1');
  });

  it('coerces string quantities to numbers', () => {
    const rows = [{ product: 'P1', quantityOnHand: '12.5' }];
    const result = aggregateProducts(rows);
    assert.equal(result[0].qty, 12.5);
  });

  it('filters out products that sum to zero across bins', () => {
    const rows = [
      { product: 'P1', quantityOnHand: 5 },
      { product: 'P1', quantityOnHand: -5 },
    ];
    assert.deepEqual(aggregateProducts(rows), []);
  });
});
