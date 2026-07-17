import ProductSearchDrawer from './ProductSearchDrawer.jsx';
import ProductStockSearchDrawer from './ProductStockSearchDrawer.jsx';

/**
 * Lookup drawer registry. Each entry is a drawer component keyed by the value of a
 * field's `lookupDrawer` property (from decisions.json). Fields without that property
 * fall back to `default`. Shared by both the add-row picker (DataTable's InlineAddRow)
 * and the inline-edit picker (InlineLinesPanel) so a window's custom drawer is used in
 * both flows. New drawers (asset, lot, etc.) plug in here without touching either render path.
 *
 * `product-stock` is the window-agnostic grouped product+stock picker (product groups,
 * warehouse-filter pills, expand/collapse per-locator rows). Used by any window whose
 * `product` field needs to resolve a storage bin / warehouse on selection (goods-movements,
 * internal-consumption, and future stock-aware windows).
 *
 * `internal-consumption-product` / `goods-movements-product` are kept as aliases pointing
 * at the same shared component, in case any older decisions.json or external reference
 * still uses the legacy per-window key.
 */
export const LOOKUP_DRAWERS = {
  default: ProductSearchDrawer,
  'product-stock': ProductStockSearchDrawer,
  'internal-consumption-product': ProductStockSearchDrawer,
  'goods-movements-product': ProductStockSearchDrawer,
};

export function resolveLookupDrawer(lookupDrawer) {
  return LOOKUP_DRAWERS[lookupDrawer] || LOOKUP_DRAWERS.default;
}
