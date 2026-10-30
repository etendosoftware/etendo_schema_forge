// @covers tools/app-shell/src/windows/custom/product/productMovements.js
// ETP-5889 — what the Movements tab asks NEO for, and how it labels each transaction.
import {
  DEFAULT_MOVEMENTS_PERIOD,
  MOVEMENTS_DEFAULT_SORT,
  buildMovementsCountQuery,
  buildMovementsCriteria,
  buildMovementsQuery,
  isMovementsSortKey,
  isStorableProduct,
  resolveMovementType,
  shouldShowMovementsTab,
  signedQuantity,
} from '../productMovements';

const parse = (path) => {
  const [route, query] = path.split('?');
  const params = new URLSearchParams(query);
  return { route, params, criteria: params.has('criteria') ? JSON.parse(params.get('criteria')) : [] };
};

describe('productMovements (ETP-5889)', () => {
  describe('isStorableProduct', () => {
    it('shows the tab for a stocked item', () => {
      expect(isStorableProduct({ id: 'p1', productType: 'I', stocked: true })).toBe(true);
    });

    it('hides it for a service, an expense and a resource', () => {
      for (const productType of ['S', 'E', 'R']) {
        expect(isStorableProduct({ id: 'p1', productType, stocked: true })).toBe(false);
      }
    });

    it('hides it for an item that is not stocked, however the flag is written', () => {
      expect(isStorableProduct({ id: 'p1', productType: 'I', stocked: false })).toBe(false);
      expect(isStorableProduct({ id: 'p1', productType: 'I', stocked: 'N' })).toBe(false);
    });

    it('hides it while the record is not saved or not loaded', () => {
      expect(isStorableProduct({ productType: 'I', stocked: true })).toBe(false);
      expect(isStorableProduct(undefined)).toBe(false);
    });
  });

  describe('shouldShowMovementsTab', () => {
    it('offers the tab for an unsaved product, so DetailView can show it disabled with its hint', () => {
      expect(shouldShowMovementsTab({ productType: 'I', stocked: true })).toBe(true);
      expect(shouldShowMovementsTab(undefined)).toBe(true);
    });

    it('hides it only for a saved product that has no stock', () => {
      expect(shouldShowMovementsTab({ id: 'p1', productType: 'S', stocked: true })).toBe(false);
      expect(shouldShowMovementsTab({ id: 'p1', productType: 'I', stocked: false })).toBe(false);
      expect(shouldShowMovementsTab({ id: 'p1', productType: 'I', stocked: true })).toBe(true);
    });
  });

  describe('buildMovementsCriteria', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 28, 10, 0, 0)); // 2026-10-28 local
    });
    afterEach(() => vi.useRealTimers());

    it('has no criteria for the whole history', () => {
      expect(buildMovementsCriteria({ direction: 'all', dateRange: null, warehouseId: null })).toEqual([]);
    });

    it('splits entries and exits by the sign of the quantity', () => {
      expect(buildMovementsCriteria({ direction: 'in' })).toEqual([
        { fieldName: 'movementQuantity', operator: 'greaterThan', value: 0 },
      ]);
      expect(buildMovementsCriteria({ direction: 'out' })).toEqual([
        { fieldName: 'movementQuantity', operator: 'lessThan', value: 0 },
      ]);
    });

    it('turns the default period into the last 7 calendar days, both ends included', () => {
      expect(buildMovementsCriteria({ dateRange: DEFAULT_MOVEMENTS_PERIOD })).toEqual([
        { fieldName: 'movementDate', operator: 'greaterOrEqual', value: '2026-10-22' },
        { fieldName: 'movementDate', operator: 'lessOrEqual', value: '2026-10-28' },
      ]);
    });

    it('accepts a custom range and a warehouse together', () => {
      const criteria = buildMovementsCriteria({
        dateRange: { from: new Date(2026, 0, 5), to: new Date(2026, 0, 20) },
        warehouseId: 'wh-1',
      });
      expect(criteria).toEqual([
        { fieldName: 'movementDate', operator: 'greaterOrEqual', value: '2026-01-05' },
        { fieldName: 'movementDate', operator: 'lessOrEqual', value: '2026-01-20' },
        { fieldName: 'etgoWarehouse', operator: 'equals', value: 'wh-1' },
      ]);
    });
  });

  describe('buildMovementsQuery', () => {
    it('asks for the first 50 rows of the product, newest first, with no criteria by default', () => {
      const { route, params, criteria } = parse(buildMovementsQuery({ productId: 'p1' }));
      expect(route).toBe('/transactions');
      expect(params.get('parentId')).toBe('p1');
      expect(params.get('_sortBy')).toBe('movementDate desc');
      expect(params.get('_startRow')).toBe('0');
      expect(params.get('_endRow')).toBe('49');
      expect(criteria).toEqual([]);
    });

    it('asks for the next page from where the last one ended', () => {
      const { params } = parse(buildMovementsQuery({ productId: 'p1', start: 100 }));
      expect(params.get('_startRow')).toBe('100');
      expect(params.get('_endRow')).toBe('149');
    });

    it('sorts the warehouse by its name, not by its id', () => {
      expect(parse(buildMovementsQuery({ productId: 'p1', sort: { key: 'warehouse', direction: 'asc' } })).params.get('_sortBy'))
        .toBe('etgoWarehouse$_identifier');
      expect(parse(buildMovementsQuery({ productId: 'p1', sort: { key: 'warehouse', direction: 'desc' } })).params.get('_sortBy'))
        .toBe('-etgoWarehouse$_identifier');
    });

    it('sorts every other column by its physical backend column', () => {
      const sortBy = (key, direction) => parse(buildMovementsQuery({ productId: 'p1', sort: { key, direction } })).params.get('_sortBy');
      expect(sortBy('type', 'asc')).toBe('etgoDocKind asc');
      expect(sortBy('quantity', 'desc')).toBe('movementQuantity desc');
      expect(sortBy('cost', 'asc')).toBe('transactionCost asc');
    });

    it('falls back to the default sort for an unknown column', () => {
      expect(parse(buildMovementsQuery({ productId: 'p1', sort: { key: 'stockAfter', direction: 'asc' } })).params.get('_sortBy'))
        .toBe('movementDate asc');
    });

    it('does not offer to sort the resulting stock', () => {
      expect(isMovementsSortKey('stockAfter')).toBe(false);
      expect(MOVEMENTS_DEFAULT_SORT).toEqual({ key: 'date', direction: 'desc' });
    });

    it('carries the filters as criteria', () => {
      const { criteria } = parse(buildMovementsQuery({ productId: 'p1', filters: { direction: 'out', warehouseId: 'wh-1' } }));
      expect(criteria).toEqual([
        { fieldName: 'movementQuantity', operator: 'lessThan', value: 0 },
        { fieldName: 'etgoWarehouse', operator: 'equals', value: 'wh-1' },
      ]);
    });
  });

  it('counts every movement of the product with a single-row request, ignoring any filter', () => {
    const { params, criteria } = parse(buildMovementsCountQuery('p1'));
    expect(params.get('parentId')).toBe('p1');
    expect(params.get('_endRow')).toBe('0');
    expect(criteria).toEqual([]);
  });

  describe('resolveMovementType', () => {
    const type = (row) => resolveMovementType(row);

    it('labels a purchase receipt and a sales shipment by their document kind', () => {
      expect(type({ etgoDocKind: 'goods-receipt', movementQuantity: 10 })).toEqual({ labelKey: 'productMovementsTypeVendorReceipt', tone: 'in' });
      expect(type({ etgoDocKind: 'goods-shipment', movementQuantity: -7 })).toEqual({ labelKey: 'productMovementsTypeCustomerShipment', tone: 'out' });
    });

    it('labels returns by the document kind the backend resolved', () => {
      expect(type({ etgoDocKind: 'return-to-vendor-shipment', movementQuantity: -3 })).toEqual({ labelKey: 'movTypeVendorReturn', tone: 'out' });
      expect(type({ etgoDocKind: 'return-material-receipt', movementQuantity: 3 })).toEqual({ labelKey: 'movTypeCustomerReturn', tone: 'in' });
    });

    it('also treats a receipt with a negative sign as a vendor return, and a shipment with a positive one as a customer return', () => {
      expect(type({ etgoDocKind: 'goods-receipt', movementQuantity: -2 }).labelKey).toBe('movTypeVendorReturn');
      expect(type({ etgoDocKind: 'goods-shipment', movementQuantity: 2 }).labelKey).toBe('movTypeCustomerReturn');
    });

    it('splits an inventory adjustment into entry and exit by sign', () => {
      expect(type({ etgoDocKind: 'physical-inventory', movementQuantity: 5 })).toEqual({ labelKey: 'productMovementsTypeInventoryIn', tone: 'in' });
      expect(type({ etgoDocKind: 'physical-inventory', movementQuantity: -5 })).toEqual({ labelKey: 'productMovementsTypeInventoryOut', tone: 'out' });
    });

    it('shows both sides of a transfer between warehouses with the neutral colour', () => {
      expect(type({ etgoDocKind: 'goods-movements', movementQuantity: 4 })).toEqual({ labelKey: 'productMovementsTypeTransfer', tone: 'neutral' });
      expect(type({ etgoDocKind: 'goods-movements', movementQuantity: -4 })).toEqual({ labelKey: 'productMovementsTypeTransfer', tone: 'neutral' });
    });

    it('labels internal consumption and keeps its colour by sign', () => {
      expect(type({ etgoDocKind: 'internal-consumption', movementQuantity: -1 })).toEqual({ labelKey: 'movTypeInternalConsumption', tone: 'out' });
      expect(type({ etgoDocKind: 'internal-consumption', movementQuantity: 1 })).toEqual({ labelKey: 'movTypeInternalConsumption', tone: 'in' });
    });

    it('falls back to the movement type code when there is no document kind', () => {
      expect(type({ etgoDocKind: null, movementType: 'M-', movementQuantity: -25 }).labelKey).toBe('productMovementsTypeTransfer');
      expect(type({ etgoDocKind: null, movementType: 'I+', movementQuantity: 236 }).labelKey).toBe('productMovementsTypeInventoryIn');
    });

    it('returns no label for a type it does not know (production, work orders)', () => {
      expect(type({ etgoDocKind: null, movementType: 'P+', movementQuantity: 8 })).toEqual({ labelKey: null, tone: 'in' });
    });
  });

  describe('signedQuantity', () => {
    const format = (n) => String(n);

    it('always shows the sign of a movement', () => {
      expect(signedQuantity(4, format)).toBe('+4');
      expect(signedQuantity(-4, format)).toBe('−4');
      expect(signedQuantity('250', format)).toBe('+250');
    });

    it('shows no sign for zero and a dash for something that is not a number', () => {
      expect(signedQuantity(0, format)).toBe('0');
      expect(signedQuantity(null, format)).toBe('—');
      expect(signedQuantity('abc', format)).toBe('—');
    });
  });
});
