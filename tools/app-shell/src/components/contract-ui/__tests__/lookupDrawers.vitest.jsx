/**
 * Unit test for the lookup drawer registry. Verifies resolveLookupDrawer maps a
 * field's `lookupDrawer` key to the correct drawer component (by reference) and
 * falls back to the default ProductSearchDrawer for undefined/unknown keys.
 */
import { LOOKUP_DRAWERS, resolveLookupDrawer } from '../lookupDrawers.js';
import ProductSearchDrawer from '../ProductSearchDrawer.jsx';
import InternalConsumptionProductSearchDrawer from '../InternalConsumptionProductSearchDrawer.jsx';
import GoodsMovementsProductSearchDrawer from '../GoodsMovementsProductSearchDrawer.jsx';

describe('lookupDrawers registry', () => {
  it('maps goods-movements-product to GoodsMovementsProductSearchDrawer', () => {
    expect(resolveLookupDrawer('goods-movements-product')).toBe(GoodsMovementsProductSearchDrawer);
  });

  it('maps internal-consumption-product to InternalConsumptionProductSearchDrawer', () => {
    expect(resolveLookupDrawer('internal-consumption-product')).toBe(InternalConsumptionProductSearchDrawer);
  });

  it('falls back to ProductSearchDrawer for undefined lookupDrawer', () => {
    expect(resolveLookupDrawer(undefined)).toBe(ProductSearchDrawer);
  });

  it('falls back to ProductSearchDrawer for an unknown lookupDrawer key', () => {
    expect(resolveLookupDrawer('does-not-exist')).toBe(ProductSearchDrawer);
  });

  it('exposes the registry with a default entry and the per-window drawers', () => {
    expect(LOOKUP_DRAWERS.default).toBe(ProductSearchDrawer);
    expect(LOOKUP_DRAWERS['internal-consumption-product']).toBe(InternalConsumptionProductSearchDrawer);
    expect(LOOKUP_DRAWERS['goods-movements-product']).toBe(GoodsMovementsProductSearchDrawer);
  });
});
