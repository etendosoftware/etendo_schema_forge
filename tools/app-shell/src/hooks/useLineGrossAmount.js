import { useCallback } from 'react';

/**
 * Per-window line configuration.
 *
 * qtyField      — form key holding the editable quantity
 * grossField    — form key to write the computed gross line amount
 * priceField    — form key holding the editable base price
 *                 (listPrice for orders/quotations, listPrice for invoices)
 * discountField — form key holding the editable discount percentage
 *                 (discount for orders, etgoDiscount for invoices)
 *
 * Add a new entry here whenever a new window type is onboarded.
 */
export const LINE_CONFIGS = {
  order:        { qtyField: 'orderedQuantity',  grossField: 'lineGrossAmount', priceField: 'listPrice',  discountField: 'discount'      },
  invoice:      { qtyField: 'invoicedQuantity', grossField: 'grossAmount',     priceField: 'listPrice',  discountField: 'etgoDiscount'  },
  returnOrder:  { qtyField: 'orderedQuantity',  grossField: 'lineGrossAmount', priceField: 'unitPrice',  discountField: null            },
};

// Convenience aliases — import the one that matches the window type.
export const ORDER_LINE_CONFIG        = LINE_CONFIGS.order;
export const INVOICE_LINE_CONFIG      = LINE_CONFIGS.invoice;
export const RETURN_ORDER_LINE_CONFIG = LINE_CONFIGS.returnOrder;

// ─── Pure helpers (no React, fully testable) ──────────────────────────────────

function resolveTaxFactorFromSiblings(taxId, siblings, grossField, discountField) {
  if (taxId != null) {
    const ref = (siblings || []).find(l => {
      if (l.tax !== taxId) return false;
      const gross = parseFloat(String(l[grossField] ?? l.grossAmount ?? l.lineGrossAmount ?? '')) || 0;
      if (gross <= 0) return false;
      const net = parseFloat(String(l.lineNetAmount ?? '')) || 0;
      if (net > 0) return true;
      const qty = parseFloat(String(l.orderedQuantity ?? l.invoicedQuantity ?? '')) || 0;
      const price = parseFloat(String(l.unitPrice ?? '')) || 0;
      return qty > 0 && price > 0;
    });
    if (ref) {
      const gross = parseFloat(String(ref[grossField] ?? ref.grossAmount ?? ref.lineGrossAmount ?? '')) || 0;
      const net = parseFloat(String(ref.lineNetAmount ?? '')) || 0;
      const disc = parseFloat(String(ref[discountField] ?? '')) || 0;
      const factor = disc > 0 ? (1 - disc / 100) : 1;
      if (net > 0) return gross / (net * factor);
      const qty = parseFloat(String(ref.orderedQuantity ?? ref.invoicedQuantity ?? '')) || 0;
      const price = parseFloat(String(ref.unitPrice ?? '')) || 0;
      const base = qty * price * factor;
      if (base > 0) return gross / base;
    }
  }

  return null;
}

/**
 * Resolves the tax factor (e.g. 1.21 for 21% VAT) from up to 5 sources:
 *   0. taxRate injected into calloutResult by the backend
 *   1. Selector aux data stored as rowValues.tax_rate
 *   2. In-memory cache (populated on source 0)
 *   3. Ratio of saved grossField / lineNetAmount from the current row (sidebar)
 *   4. Same ratio derived from any sibling saved line with the same tax id
 *
 * Mutates taxRateCache when source 0 resolves to populate future cache hits.
 *
 * @param {string|undefined}        taxId
 * @param {object}                  calloutResult
 * @param {object}                  rowValues
 * @param {Record<string,number>}   taxRateCache   Plain object (taxRateCacheRef.current)
 * @param {Array}                   siblings       Saved sibling lines (hook.children)
 * @param {string}                  grossField     Config: which field holds the line gross
 * @param {string}                  [discountField='discount']  Config: which field holds the discount %
 * @returns {number|null}
 */
export function resolveTaxFactor(taxId, calloutResult, rowValues, taxRateCache, siblings, grossField, discountField = 'discount') {
  // 0. Backend-injected rate
  const calloutRate = parseFloat(String(calloutResult.taxRate ?? ''));
  if (!isNaN(calloutRate)) {
    if (taxId) taxRateCache[taxId] = calloutRate;
    return 1 + calloutRate / 100;
  }

  // 1. Selector aux data
  const auxRate = parseFloat(String(rowValues['tax_rate'] ?? ''));
  if (!isNaN(auxRate) && auxRate >= 0) return 1 + auxRate / 100;

  // 2. Cache from a previous callout
  if (taxId != null) {
    const cached = taxRateCache[taxId];
    if (cached != null) return 1 + cached / 100;
  }

  // 3. Ratio from current row's persisted amounts (sidebar)
  const savedGross = parseFloat(String(rowValues[grossField] ?? rowValues.grossAmount ?? '')) || 0;
  const savedNet   = parseFloat(String(rowValues.lineNetAmount ?? '')) || 0;
  if (savedGross > 0 && savedNet > 0) return savedGross / savedNet;

  // 4. Any sibling line with the same tax
  return resolveTaxFactorFromSiblings(taxId, siblings, grossField, discountField);
}

function deriveNetFromProductChange(calloutResult, priceField, rowValues, discountField, qty) {
  const calloutNet = parseFloat(String(calloutResult.lineNetAmount ?? calloutResult.lineNetAmt ?? '')) || 0;
  if (calloutNet > 0) return calloutNet;
  const priceStr = calloutResult[priceField] != null
      ? String(calloutResult[priceField])
      : String(rowValues[priceField] ?? '');
  const p = parseFloat(priceStr) || 0;
  const d = parseFloat(String(calloutResult[discountField] ?? rowValues[discountField] ?? '')) || 0;
  return qty > 0 && p > 0 ? qty * p * (1 - d / 100) : 0;
}

function calculateBasicLineNet(qty, price, discFactor) {
  return qty > 0 && price > 0 ? qty * price * discFactor : 0;
}

/**
 * Derives the taxable net amount for the changed field.
 *
 * The base price is config.priceField:
 *   - Orders/quotations: listPrice (the catalog price the user sees and edits)
 *   - Invoices: listPrice
 *
 * Discount is always applied so the gross can be computed correctly.
 *
 * @param {string}        field        Changed field key
 * @param {string|number} value        New value
 * @param {object}        calloutResult
 * @param {object}        rowValues
 * @param {string}        qtyField     Config: qty field key
 * @param {string}        [priceField='unitPrice']   Config: base price field key
 * @param {string}        [discountField='discount'] Config: discount % field key
 * @returns {number}  0 when indeterminate
 */
export function deriveLineNet(field, value, calloutResult, rowValues, qtyField, priceField = 'unitPrice', discountField = 'discount') {
  const qty      = parseFloat(String(rowValues[qtyField]      ?? '')) || 0;
  const price    = parseFloat(String(rowValues[priceField]    ?? '')) || 0;
  const discount = parseFloat(String(rowValues[discountField] ?? '')) || 0;
  const discFactor = 1 - discount / 100;

  if (field === qtyField) {
    const q = parseFloat(value) || 0;
    return q > 0 && price > 0 ? q * price * discFactor : 0;
  }

  if (field === priceField) {
    const p = parseFloat(value) || 0;
    return qty > 0 && p > 0 ? qty * p * discFactor : 0;
  }

  if (field === discountField) {
    const d = parseFloat(String(value)) || 0;
    return qty > 0 && price > 0 ? qty * price * (1 - d / 100) : 0;
  }

  if (field === 'product') {
    return deriveNetFromProductChange(calloutResult, priceField, rowValues, discountField, qty);
  }

  if (field === 'tax') {
    return calculateBasicLineNet(qty, price, discFactor);
  }

  return parseFloat(String(
    calloutResult.lineNetAmount ?? calloutResult.lineNetAmt ??
    rowValues.lineNetAmount     ?? rowValues.lineNetAmt     ?? ''
  )) || 0;
}

/**
 * Mutates calloutResult in place, adding grossAmount and the window-specific
 * gross field (lineGrossAmount for orders, grossAmount for invoices).
 *
 * For client-side computed fields (qty, priceField, discountField), the gross is
 * always recomputed locally — callout values are overridden.
 * For product changes, the callout's grossAmount is trusted if non-zero.
 *
 * @param {string}        field
 * @param {string|number} value
 * @param {object}        calloutResult
 * @param {object}        rowValues
 * @param {Record<string,number>} taxRateCache
 * @param {Array}         siblings
 * @param {{ qtyField: string, grossField: string, priceField: string, discountField: string }} config
 */
export function computeLineGrossAmount(field, value, calloutResult, rowValues, taxRateCache, siblings, config) {
  const discountField = config.discountField || 'discount';
  const lineNet = deriveLineNet(field, value, calloutResult, rowValues, config.qtyField, config.priceField, discountField);

  // Keep lineNetAmount in sync for fields the UI computes client-side.
  const clientSideFields = [config.qtyField, config.priceField, discountField];
  if (clientSideFields.includes(field) && lineNet > 0) {
    if (calloutResult.lineNetAmount == null || Number(calloutResult.lineNetAmount) === 0) {
      calloutResult.lineNetAmount = parseFloat(lineNet.toFixed(2));
    }
  }

  // For product changes, trust the callout if it already computed the gross amount.
  if (field === 'product' && calloutResult.grossAmount != null && Number(calloutResult.grossAmount) !== 0) return;

  // When a client-side field produces exactly 0 AND qty+price are both set, the
  // zero is intentional (e.g. 100% discount). Explicitly zero out the gross so
  // stale intermediate values (e.g. grossAmount from when the user typed "10" on
  // the way to "100") do not remain visible. When qty or price is missing the
  // zero is indeterminate — leave result unchanged.
  if (clientSideFields.includes(field) && lineNet === 0) {
    const qty   = parseFloat(String(rowValues[config.qtyField]   ?? '')) || 0;
    const price = parseFloat(String(rowValues[config.priceField] ?? '')) || 0;
    if (qty > 0 && price > 0) {
      calloutResult.lineNetAmount = 0;
      calloutResult.grossAmount = 0;
      calloutResult[config.grossField] = 0;
    }
    return;
  }

  if (lineNet <= 0) return;

  const taxId  = calloutResult.tax ?? rowValues.tax;
  const factor = resolveTaxFactor(taxId, calloutResult, rowValues, taxRateCache, siblings, config.grossField, discountField);
  if (factor === null) return;

  calloutResult.grossAmount = parseFloat((lineNet * factor).toFixed(2));

  // Always override for client-side fields and tax changes to correct any stale callout value.
  const forceOverride = [...clientSideFields, 'tax'].includes(field);
  if (forceOverride || calloutResult[config.grossField] == null || Number(calloutResult[config.grossField]) === 0) {
    calloutResult[config.grossField] = calloutResult.grossAmount;
  }
}

/**
 * Prepares a line record for POST/PATCH by deriving unitPrice from listPrice and discount.
 * unitPrice (PriceActual) = listPrice × (1 − discount/100).
 * For configs where priceField = 'unitPrice', this is a no-op.
 * Mutates lineData in place.
 *
 * @param {object} lineData   Mutable line record about to be sent
 * @param {{ priceField: string, discountField?: string }} config
 */
export function computeUnitPriceForPost(lineData, config) {
  if (config.priceField === 'unitPrice') return;
  const discountField = config.discountField || 'discount';
  const listPrice = parseFloat(String(lineData[config.priceField] ?? '')) || 0;
  const discount  = parseFloat(String(lineData[discountField]     ?? '')) || 0;
  if (listPrice > 0) {
    lineData.unitPrice = parseFloat((listPrice * (1 - discount / 100)).toFixed(6));
  }
}

// ─── React hook ──────────────────────────────────────────────────────────────

/**
 * React hook that binds the pure helpers to the component's taxRateCacheRef
 * and children list, returning stable memoized functions.
 *
 * @param {React.MutableRefObject<Record<string,number>>} taxRateCacheRef
 * @param {Array}  children   Saved child lines (hook.children)
 * @param {{ qtyField: string, grossField: string, priceField: string, discountField: string }} [config]  Defaults to ORDER_LINE_CONFIG
 */
export function useLineGrossAmount(taxRateCacheRef, children, config = ORDER_LINE_CONFIG) {
  const discountField = config.discountField || 'discount';

  const boundResolveTaxFactor = useCallback(
    (taxId, calloutResult, rowValues) =>
      resolveTaxFactor(taxId, calloutResult, rowValues, taxRateCacheRef.current, children, config.grossField, discountField),
    [taxRateCacheRef, children, config.grossField, discountField],
  );

  const boundDeriveLineNet = useCallback(
    (field, value, calloutResult, rowValues) =>
      deriveLineNet(field, value, calloutResult, rowValues, config.qtyField, config.priceField, discountField),
    [config.qtyField, config.priceField, discountField],
  );

  const boundComputeLineGrossAmount = useCallback(
    (field, value, calloutResult, rowValues) =>
      computeLineGrossAmount(field, value, calloutResult, rowValues, taxRateCacheRef.current, children, config),
    [taxRateCacheRef, children, config],
  );

  const boundPrepareLineForPost = useCallback(
    (lineData) => computeUnitPriceForPost(lineData, config),
    [config],
  );

  return {
    computeLineGrossAmount: boundComputeLineGrossAmount,
    resolveTaxFactor:       boundResolveTaxFactor,
    deriveLineNet:          boundDeriveLineNet,
    prepareLineForPost:     boundPrepareLineForPost,
  };
}
