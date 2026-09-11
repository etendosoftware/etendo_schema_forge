import { useEffect, useRef } from 'react';

const NON_STOCKABLE_PRODUCT_TYPES = new Set(['S', 'E', 'R']);

/**
 * ETP-5091 follow-up: invisible logic-only component wired as this window's
 * `formFooter` (`window.headerExtra.customForm` in decisions.json) — the one
 * custom-component slot that stays mounted continuously (CSS-hidden, never
 * unmounted, while a different primary tab is active — see DetailView.jsx's
 * `buildHeaderFooter` and `getDetailContentContainerClassName`).
 *
 * `ProductAdditionalInfoPanel`, by contrast, is DetailView's custom PRIMARY TAB
 * Panel: it fully unmounts whenever "Información adicional" isn't the active
 * tab. `productType` itself lives on the General tab, so every edit to it
 * happens while that panel is unmounted — an effect living there can never
 * observe a live productType transition; every mount starts fresh with
 * "previous === current" by construction, so it can force stocked/returnable
 * to false (a stateless invariant check) but never restore them to true on
 * the reverse transition, and even the false direction only self-corrects
 * lazily once the user happens to open that tab afterward.
 *
 * This component watches `data.productType` for the SAME mounted record and,
 * the instant it actually changes, force-sets `stocked`/`returnable` to
 * match: false for Service/Expense/Resource (no physical existence), true
 * otherwise (Artículo) — regardless of which tab is on screen. Renders
 * nothing.
 */
export default function ProductStockDefaultsWatcher({ data, onChange }) {
  const prevRef = useRef({ id: data?.id, productType: data?.productType });

  useEffect(() => {
    const prev = prevRef.current;
    const currId = data?.id;
    const currType = data?.productType;
    prevRef.current = { id: currId, productType: currType };

    if (prev.id !== currId) return; // different record loaded, not a live edit
    if (prev.productType === currType) return; // productType itself didn't change

    const wasNonStockable = NON_STOCKABLE_PRODUCT_TYPES.has(prev.productType);
    const isNonStockable = NON_STOCKABLE_PRODUCT_TYPES.has(currType);
    if (wasNonStockable === isNonStockable) return; // "stockable-ness" didn't flip

    onChange?.('stocked', !isNonStockable);
    onChange?.('returnable', !isNonStockable);
  }, [data?.id, data?.productType, onChange]);

  return null;
}
