import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateProducts } from '../warehouseUtils.js';

describe('aggregateProducts', () => {
  describe('empty / null input', () => {
    it('returns empty array for empty rows', () => {
      assert.deepEqual(aggregateProducts([]), []);
    });

    it('returns empty array for empty rows with uomMap', () => {
      assert.deepEqual(aggregateProducts([], { 'uom-1': 'Each' }), []);
    });
  });

  describe('deduplication and summing', () => {
    it('deduplicates rows by product id and sums quantityOnHand', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 50 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].qty, 15);
    });

    it('sums etgoValuation across duplicate product rows', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 50 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result[0].valuation, 150);
    });

    it('keeps distinct products separate', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100 },
        { product: 'p2', 'product$_identifier': 'Gadget', uOM: 'u2', quantityOnHand: 3, etgoValuation: 30 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result.length, 2);
    });
  });

  describe('zero / negative quantity — no filtering (caller decides)', () => {
    // aggregateProducts no longer filters by qty. Each consumer (Products tab,
    // list product-count cell, "in stock > 0" KPI) applies its own predicate,
    // so this helper must return every aggregated product, including qty === 0
    // and qty < 0 rows.
    it('keeps products with qty === 0 after aggregation', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 0, etgoValuation: 0 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].qty, 0);
    });

    it('keeps products where positive and negative sums cancel to 0', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 50 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: -5, etgoValuation: -50 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].qty, 0);
    });

    it('keeps products where qty is negative after aggregation', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 3, etgoValuation: 30 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: -10, etgoValuation: -100 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].qty, -7);
    });

    it('keeps products where qty is positive after aggregation', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: -3, etgoValuation: -30 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].qty, 7);
    });
  });

  describe('UOM resolution order', () => {
    it('uses uomMap[uOMid] when present', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 1, etgoValuation: 10 }];
      const result = aggregateProducts(rows, { u1: 'Each' });
      assert.equal(result[0].uom, 'Each');
    });

    it('falls back to uOM$_identifier when uomMap does not contain the id', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', 'uOM$_identifier': 'Units', quantityOnHand: 1, etgoValuation: 10 }];
      const result = aggregateProducts(rows, {});
      assert.equal(result[0].uom, 'Units');
    });

    it('falls back to raw uOM id when neither uomMap nor uOM$_identifier is present', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 1, etgoValuation: 10 }];
      const result = aggregateProducts(rows, {});
      assert.equal(result[0].uom, 'u1');
    });

    it('uses empty string when uOM field is missing entirely', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', quantityOnHand: 1, etgoValuation: 10 }];
      const result = aggregateProducts(rows);
      // uomId is '', uomMap[''] is undefined, row has no uOM$_identifier → falls to ''
      assert.equal(result[0].uom, '');
    });
  });

  describe('numeric coercion of bad values', () => {
    it('treats non-numeric quantityOnHand as 0', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 'bad', etgoValuation: 0 },
      ];
      // qty becomes 0 — still returned; no filtering happens in aggregateProducts
      const result = aggregateProducts(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].qty, 0);
    });

    it('treats undefined quantityOnHand as 0', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', etgoValuation: 0 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].qty, 0);
    });

    it('treats non-numeric etgoValuation as 0', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 'n/a' }];
      const result = aggregateProducts(rows);
      assert.equal(result[0].valuation, 0);
    });

    it('coerces numeric string quantityOnHand', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: '7', etgoValuation: '70' }];
      const result = aggregateProducts(rows);
      assert.equal(result[0].qty, 7);
      assert.equal(result[0].valuation, 70);
    });
  });

  describe('missing product id', () => {
    it('groups rows with missing product under "unknown"', () => {
      const rows = [
        { 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 3, etgoValuation: 30 },
        { 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 2, etgoValuation: 20 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'unknown');
      assert.equal(result[0].qty, 5);
    });
  });

  describe('label resolution', () => {
    it('uses product$_identifier as label when present', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'My Product', uOM: 'u1', quantityOnHand: 1, etgoValuation: 5 }];
      assert.equal(aggregateProducts(rows)[0].label, 'My Product');
    });

    it('falls back to product id as label when identifier is absent', () => {
      const rows = [{ product: 'p1', uOM: 'u1', quantityOnHand: 1, etgoValuation: 5 }];
      assert.equal(aggregateProducts(rows)[0].label, 'p1');
    });
  });

  describe('cost field (etgoCost)', () => {
    it('takes cost from etgoCost on a single-bin product', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100, etgoCost: 10 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result[0].cost, 10);
    });

    it('does NOT sum cost across duplicate product rows (unlike qty and valuation)', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100, etgoCost: 10 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 50, etgoCost: 10 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].qty, 15);
      assert.equal(result[0].valuation, 150);
      // cost stays the single unit cost from the first insert, not 20
      assert.equal(result[0].cost, 10);
    });

    it('keeps cost from the first row even if a later duplicate row has a different etgoCost value', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100, etgoCost: 10 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 50, etgoCost: 999 },
      ];
      const result = aggregateProducts(rows);
      assert.equal(result[0].cost, 10);
    });

    it('treats missing etgoCost as 0', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 1, etgoValuation: 5 }];
      assert.equal(aggregateProducts(rows)[0].cost, 0);
    });

    it('treats non-numeric etgoCost as 0', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 1, etgoValuation: 5, etgoCost: 'n/a' }];
      assert.equal(aggregateProducts(rows)[0].cost, 0);
    });

    it('coerces numeric string etgoCost', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 1, etgoValuation: 5, etgoCost: '25' }];
      assert.equal(aggregateProducts(rows)[0].cost, 25);
    });
  });
});
