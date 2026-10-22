import { useEffect, useRef } from 'react';

import { useApiFetch } from '@/auth/useApiFetch.js';

const NON_STOCKABLE_PRODUCT_TYPES = new Set(['S', 'E', 'R']);

// ETP-5696: the sheet no longer exposes Sale/Purchase ("Availability"); they are always saved as true.
const ALWAYS_TRUE_FIELDS = ['sale', 'purchase'];
// The fields the unified sheet lets the user edit. A change to any of them is a user edit; other keys
// of `data` (stock, prices, ...) also change on their own after load and must not count as one.
const EDITABLE_FIELDS = [
  'searchKey', 'name', 'productType', 'productCategory', 'uOM', 'taxCategory',
  'stocked', 'returnable', 'active', 'description', 'image',
];

const isTrue = v => v === true || v === 'Y' || v === 'true';

/**
 * Invisible logic-only component wired as this window's `formFooter`
 * (`window.headerExtra.customForm` in decisions.json). It stays mounted for the whole
 * lifetime of the sheet and owns the product-level invariants the form itself cannot
 * express because they depend on a *change*, not on a value:
 *
 * - ETP-5091: when `productType` flips between stockable (Item) and non-stockable
 *   (Service/Expense/Resource), force `stocked`/`returnable` to match — false for
 *   Service/Expense/Resource (no physical existence), true for Item. The two fields are only
 *   shown for Item (`displayLogicJs` in decisions.json), so the user can never fix them by hand.
 * - ETP-5696: `sale`/`purchase` are hidden and always saved as true. A new record gets them from the
 *   field defaults; a legacy product saved with either false is corrected the first time the user
 *   edits it from the sheet. Merely opening a record never dirties it.
 *
 * Renders nothing.
 */
export default function ProductStockDefaultsWatcher({ data, onChange, entity = 'product', apiBaseUrl }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  // Latest-wins guard: a slow response for an earlier type must not overwrite a later pick.
  const taxRequestRef = useRef(0);
  useEffect(() => () => { taxRequestRef.current += 1; }, []);
  const prevRef = useRef({ id: data?.id, snapshot: null, productType: data?.productType });

  // GET /product/defaults?productType=X; the backend returns `typeTaxCategory` only when the
  // tenant has the category named for the type, so a missing name leaves the field untouched.
  const applyTaxCategoryForType = async (productType) => {
    const requestId = ++taxRequestRef.current;
    try {
      const res = await apiFetch(`/${entity}/defaults?productType=${encodeURIComponent(productType)}`);
      if (!res.ok || requestId !== taxRequestRef.current) return;
      const json = await res.json();
      const defaults = json?.defaults || {};
      if (!defaults.typeTaxCategory || requestId !== taxRequestRef.current) return;
      onChange?.('taxCategory', defaults.typeTaxCategory);
      onChange?.('taxCategory$_identifier', defaults['typeTaxCategory$_identifier'] ?? '');
    } catch {
      // Best effort: any failure leaves the tax category as the user has it.
    }
  };

  useEffect(() => {
    const prev = prevRef.current;
    const currId = data?.id;
    const currType = data?.productType;
    const snapshot = EDITABLE_FIELDS.map(k => data?.[k]);
    prevRef.current = { id: currId, snapshot, productType: currType };

    if (prev.id !== currId) {
      // Different record loaded, not a live edit: drop any tax-category reply still in flight so it
      // can never land on the newly loaded record.
      taxRequestRef.current += 1;
      return;
    }

    if (prev.productType !== currType) {
      const wasNonStockable = NON_STOCKABLE_PRODUCT_TYPES.has(prev.productType);
      const isNonStockable = NON_STOCKABLE_PRODUCT_TYPES.has(currType);
      if (wasNonStockable !== isNonStockable) {
        onChange?.('stocked', !isNonStockable);
        onChange?.('returnable', !isNonStockable);
      }
      // ETP-5680: only a live productType change (same record, a previous defined type) reaches
      // here, so opening/loading a saved product never touches its tax category. A brand-new
      // record (no id) may go from undefined to its first type.
      if (currType && (prev.productType || !currId)) {
        applyTaxCategoryForType(currType);
      }
    }

    const edited = prev.snapshot !== null && snapshot.some((v, i) => v !== prev.snapshot[i]);
    if (!edited) return;
    for (const key of ALWAYS_TRUE_FIELDS) {
      if (data?.[key] !== undefined && !isTrue(data[key])) onChange?.(key, true);
    }
  }, [data, onChange]);

  return null;
}
