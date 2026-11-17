import { useMemo } from 'react';
import { InlineSearchCombo } from '@/components/contract-ui/InlineSearchCombo.jsx';
import { deriveSelectorUrl } from '@/components/copilot/ocr/ocrQuery.js';

/**
 * The selectors the panel searches (plan 9.1): the purchase-invoice vendor and line product
 * selectors (what the single-invoice OCR flow uses, `ocrDocTypes.js`), the product spec's
 * category and unit selectors, and the contacts' country selector. A search is always a selector
 * `q` (never a raw `_neoWhere`, which the production WAF blocks).
 */
const PURCHASE_INVOICE = 'purchase-invoice';
export const PICKER_SELECTORS = Object.freeze({
  vendor: { spec: PURCHASE_INVOICE, entity: 'header', column: 'C_BPartner_ID', params: { isSOTrx: 'N', isVendor: 'Y' } },
  product: { spec: PURCHASE_INVOICE, entity: 'lines', column: 'M_Product_ID', params: {} },
  category: { spec: 'product', entity: 'product', column: 'M_Product_Category_ID', params: {} },
  uom: { spec: 'product', entity: 'product', column: 'C_UOM_ID', params: {} },
  country: { spec: 'contacts', entity: 'locationAddress', column: 'C_Country_ID', params: {} },
  // The SAME selector the purchase-invoice lines use for their tax (the `tax` field, inputMode selector).
  tax: { spec: PURCHASE_INVOICE, entity: 'lines', column: 'C_Tax_ID', params: {} },
});

const NO_OPTIONS = Object.freeze([]);

/**
 * ETP-6050 S2 — a search-and-pick over a NEO selector, built on the shared `InlineSearchCombo`, so
 * it opens on the committed value: marked with a check and `aria-selected`, centred, arrows
 * starting from it (`selectorSelection.js`, `useLocateCommittedValue`). `value` is the committed
 * id and `label` its name; leaving either out would make the picker open at the top without
 * telling anyone. The combo never clears the value on typing (`clearOnType={false}`): a typed
 * search is not a choice, and nothing is written until the user picks a row.
 *
 * @param {{kind: keyof typeof PICKER_SELECTORS, apiBaseUrl: string, value?: string|null,
 *   label?: string, placeholder?: string, fieldKey: string, params?: object, onPick: (pick: {id: string,
 *   name: string, option: object}) => void}} props
 */
export function EntityPicker({ kind, apiBaseUrl, value = null, label = '', placeholder = '', fieldKey, onPick, params = null }) {
  const spec = PICKER_SELECTORS[kind];
  const selectorUrl = useMemo(
    () => deriveSelectorUrl(apiBaseUrl, spec.spec, spec.entity, spec.column),
    [apiBaseUrl, spec],
  );
  // Extra selector context (the tax selector reads the document date and the supplier's address); keyed
  // by content so a new object each render does not refetch.
  const paramsKey = JSON.stringify(params ?? {});
  const selectorContext = useMemo(() => ({ ...spec.params, ...JSON.parse(paramsKey) }), [spec, paramsKey]);
  const field = useMemo(() => ({ key: fieldKey, id: fieldKey, required: true }), [fieldKey]);
  return (
    <InlineSearchCombo
      field={field}
      value={value ?? ''}
      displayLabel={label}
      options={NO_OPTIONS}
      selectorUrl={selectorUrl}
      selectorContext={selectorContext}
      placeholder={placeholder}
      clearOnType={false}
      onChange={(id, name, option) => { if (id) onPick({ id, name, option: option ?? {} }); }}
      data-testid={`EntityPicker__${fieldKey}`} />
  );
}
