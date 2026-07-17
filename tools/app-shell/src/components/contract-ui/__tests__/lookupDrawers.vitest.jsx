/**
 * Unit test for the lookup drawer registry. Verifies resolveLookupDrawer maps a
 * field's `lookupDrawer` key to the correct drawer component (by reference) and
 * falls back to the default ProductSearchDrawer for undefined/unknown keys.
 *
 * `product-stock` is the unified, window-agnostic product+stock picker that replaced
 * the per-window GoodsMovementsProductSearchDrawer and InternalConsumptionProductSearchDrawer
 * components. The legacy keys `internal-consumption-product` / `goods-movements-product`
 * are kept as aliases pointing at the same shared component.
 */
import { LOOKUP_DRAWERS, resolveLookupDrawer } from '../lookupDrawers.js';
import ProductSearchDrawer from '../ProductSearchDrawer.jsx';
import ProductStockSearchDrawer from '../ProductStockSearchDrawer.jsx';

describe('lookupDrawers registry', () => {
  it('maps product-stock to ProductStockSearchDrawer', () => {
    expect(resolveLookupDrawer('product-stock')).toBe(ProductStockSearchDrawer);
  });

  it('maps the legacy goods-movements-product key to ProductStockSearchDrawer', () => {
    expect(resolveLookupDrawer('goods-movements-product')).toBe(ProductStockSearchDrawer);
  });

  it('maps the legacy internal-consumption-product key to ProductStockSearchDrawer', () => {
    expect(resolveLookupDrawer('internal-consumption-product')).toBe(ProductStockSearchDrawer);
  });

  it('falls back to ProductSearchDrawer for undefined lookupDrawer', () => {
    expect(resolveLookupDrawer(undefined)).toBe(ProductSearchDrawer);
  });

  it('falls back to ProductSearchDrawer for an unknown lookupDrawer key', () => {
    expect(resolveLookupDrawer('does-not-exist')).toBe(ProductSearchDrawer);
  });

  it('exposes the registry with a default entry and the product-stock aliases', () => {
    expect(LOOKUP_DRAWERS.default).toBe(ProductSearchDrawer);
    expect(LOOKUP_DRAWERS['product-stock']).toBe(ProductStockSearchDrawer);
    expect(LOOKUP_DRAWERS['internal-consumption-product']).toBe(ProductStockSearchDrawer);
    expect(LOOKUP_DRAWERS['goods-movements-product']).toBe(ProductStockSearchDrawer);
  });
});
