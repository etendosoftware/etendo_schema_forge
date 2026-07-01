import ProductSearchDrawer from './ProductSearchDrawer.jsx';
import InternalConsumptionProductSearchDrawer from './InternalConsumptionProductSearchDrawer.jsx';
import GoodsMovementsProductSearchDrawer from './GoodsMovementsProductSearchDrawer.jsx';

/**
 * Lookup drawer registry. Each entry is a drawer component keyed by the value of a
 * field's `lookupDrawer` property (from decisions.json). Fields without that property
 * fall back to `default`. Shared by both the add-row picker (DataTable's InlineAddRow)
 * and the inline-edit picker (InlineLinesPanel) so a window's custom drawer is used in
 * both flows. New drawers (asset, lot, etc.) plug in here without touching either render path.
 */
export const LOOKUP_DRAWERS = {
  default: ProductSearchDrawer,
  'internal-consumption-product': InternalConsumptionProductSearchDrawer,
  'goods-movements-product': GoodsMovementsProductSearchDrawer,
};

export function resolveLookupDrawer(lookupDrawer) {
  return LOOKUP_DRAWERS[lookupDrawer] || LOOKUP_DRAWERS.default;
}
