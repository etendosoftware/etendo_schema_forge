import { describe, it, expect } from 'vitest';
import { aggregateProducts } from '../warehouseUtils';

describe('aggregateProducts', () => {
  describe('empty / null input', () => {
    it('returns empty array for empty rows', () => {
      expect(aggregateProducts([])).toEqual([]);
    });

    it('returns empty array for empty rows with uomMap', () => {
      expect(aggregateProducts([], { 'uom-1': 'Each' })).toEqual([]);
    });
  });

  describe('deduplication and summing', () => {
    it('deduplicates rows by product id and sums quantityOnHand', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 50 },
      ];
      const result = aggregateProducts(rows);
      expect(result).toHaveLength(1);
      expect(result[0].qty).toBe(15);
    });

    it('sums etgoValuation across duplicate product rows', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 50 },
      ];
      const result = aggregateProducts(rows);
      expect(result[0].valuation).toBe(150);
    });

    it('keeps distinct products separate', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100 },
        { product: 'p2', 'product$_identifier': 'Gadget', uOM: 'u2', quantityOnHand: 3, etgoValuation: 30 },
      ];
      const result = aggregateProducts(rows);
      expect(result).toHaveLength(2);
    });
  });

  describe('zero / negative quantity filtering', () => {
    it('filters out products with qty <= 0 after aggregation', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 0, etgoValuation: 0 },
      ];
      expect(aggregateProducts(rows)).toEqual([]);
    });

    it('filters out products where positive and negative sums cancel to 0', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 50 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: -5, etgoValuation: -50 },
      ];
      expect(aggregateProducts(rows)).toEqual([]);
    });

    it('keeps products where qty is positive after aggregation', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100 },
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: -3, etgoValuation: -30 },
      ];
      const result = aggregateProducts(rows);
      expect(result).toHaveLength(1);
      expect(result[0].qty).toBe(7);
    });
  });

  describe('UOM resolution order', () => {
    it('uses uomMap[uOMid] when present', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 1, etgoValuation: 10 }];
      const result = aggregateProducts(rows, { u1: 'Each' });
      expect(result[0].uom).toBe('Each');
    });

    it('falls back to uOM$_identifier when uomMap does not contain the id', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', 'uOM$_identifier': 'Units', quantityOnHand: 1, etgoValuation: 10 }];
      const result = aggregateProducts(rows, {});
      expect(result[0].uom).toBe('Units');
    });

    it('falls back to raw uOM id when neither uomMap nor uOM$_identifier is present', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 1, etgoValuation: 10 }];
      const result = aggregateProducts(rows, {});
      expect(result[0].uom).toBe('u1');
    });

    it('uses empty string when uOM field is missing entirely', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', quantityOnHand: 1, etgoValuation: 10 }];
      const result = aggregateProducts(rows);
      // uomId is '', uomMap[''] is undefined, row has no uOM$_identifier → falls to ''
      expect(result[0].uom).toBe('');
    });
  });

  describe('numeric coercion of bad values', () => {
    it('treats non-numeric quantityOnHand as 0', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 'bad', etgoValuation: 0 },
      ];
      // qty becomes 0 → filtered out
      expect(aggregateProducts(rows)).toEqual([]);
    });

    it('treats undefined quantityOnHand as 0', () => {
      const rows = [
        { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', etgoValuation: 0 },
      ];
      expect(aggregateProducts(rows)).toEqual([]);
    });

    it('treats non-numeric etgoValuation as 0', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 'n/a' }];
      const result = aggregateProducts(rows);
      expect(result[0].valuation).toBe(0);
    });

    it('coerces numeric string quantityOnHand', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: '7', etgoValuation: '70' }];
      const result = aggregateProducts(rows);
      expect(result[0].qty).toBe(7);
      expect(result[0].valuation).toBe(70);
    });
  });

  describe('missing product id', () => {
    it('groups rows with missing product under "unknown"', () => {
      const rows = [
        { 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 3, etgoValuation: 30 },
        { 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 2, etgoValuation: 20 },
      ];
      const result = aggregateProducts(rows);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('unknown');
      expect(result[0].qty).toBe(5);
    });
  });

  describe('label resolution', () => {
    it('uses product$_identifier as label when present', () => {
      const rows = [{ product: 'p1', 'product$_identifier': 'My Product', uOM: 'u1', quantityOnHand: 1, etgoValuation: 5 }];
      expect(aggregateProducts(rows)[0].label).toBe('My Product');
    });

    it('falls back to product id as label when identifier is absent', () => {
      const rows = [{ product: 'p1', uOM: 'u1', quantityOnHand: 1, etgoValuation: 5 }];
      expect(aggregateProducts(rows)[0].label).toBe('p1');
    });
  });
});
