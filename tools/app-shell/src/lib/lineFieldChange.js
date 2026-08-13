/**
 * Pure helpers extracted from DetailView.handleLineFieldChange.
 * No React, no imports — fully testable in isolation.
 */

const UUID_RE = /^[0-9A-Fa-f]{32}$|^[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/;
const AUX_RE  = /^[a-zA-Z]+_[A-Z]{2,4}$/;
const QTY_KEYS = ['invoicedQuantity', 'orderedQuantity', 'movementQuantity'];
const AMT_KEYS = ['grossAmount', 'lineGrossAmount', 'lineNetAmount'];

/**
 * Merges header data into the line row snapshot.
 * Header fields (priceList, businessPartner, etc.) provide callout context
 * without overwriting values the user has already set on the line.
 */
export function buildCalloutFormState(rowValues, headerData) {
  const formState = { ...rowValues };
  for (const [k, v] of Object.entries(headerData)) {
    if (!(k in formState) && v != null && v !== '') {
      formState[k] = v;
    }
  }
  return formState;
}

/**
 * Extracts auxiliary values (e.g. product_PSTD, product_UOM) from form state.
 * These are side-loaded by selector components and forwarded to the callout.
 */
export function extractAuxValues(formState) {
  const aux = {};
  for (const [k, v] of Object.entries(formState)) {
    if (AUX_RE.test(k) && v != null && v !== '') {
      aux[k] = String(v);
    }
  }
  return aux;
}

/**
 * Substitutes orderedQuantity = 1 when the value is falsy.
 * Classic callouts (SL_Order_Amt) return grossAmount=0 for qty=0,
 * making netUnitPrice=0 and breaking the per-unit price display.
 */
export function normalizeCalloutQty(formState) {
  if (!Number(formState.orderedQuantity)) {
    return { ...formState, orderedQuantity: 1 };
  }
  return formState;
}

function combosNorm(calloutData, result) {
  for (const [k, combo] of Object.entries(calloutData.combos)) {
    // Empty selected means "no change" — backend returns selected:"" when
    // the callout does not explicitly set the combo (e.g. tax on SL_Order_Product).
    if (combo.selected != null && combo.selected !== '') {
      result[k] = combo.selected;
      if (combo._identifier) result[k + '$_identifier'] = combo._identifier;
    }
  }
}

/**
 * Flattens calloutData.updates + calloutData.combos into a plain result object.
 *
 * UUID guard: classic callouts return value:"" for FK fields they didn't set —
 * that is NOT an intentional clear. We skip empty updates when the existing
 * value is an Etendo UUID (32-char hex or standard UUID). Non-UUID fields
 * (numbers, strings) treat "" as a legitimate reset.
 *
 * @param {object} calloutData  Raw response from /callout endpoint
 * @param {object} rowValues    Current line row state (for UUID guard)
 */
export function normalizeCalloutResponse(calloutData, rowValues) {
  const result = {};

  if (calloutData.updates) {
    for (const [k, entry] of Object.entries(calloutData.updates)) {
      const existingIsUuid = typeof rowValues[k] === 'string' && UUID_RE.test(rowValues[k]);
      if (entry.value === '' && existingIsUuid) continue;
      result[k] = entry.value;
      if (entry._identifier) result[k + '$_identifier'] = entry._identifier;
    }
  }

  if (calloutData.combos) {
    combosNorm(calloutData, result);
  }

  return result;
}

/**
 * Prevents callouts from zeroing quantities the user has already set.
 * Classic product callouts reset qty to 0 as a "clear-for-entry" signal.
 * Mutates result in place.
 */
export function applyQtyZeroGuard(result, rowValues) {
  for (const key of QTY_KEYS) {
    if (result[key] === 0 && Number(rowValues[key]) > 0) {
      delete result[key];
    }
  }
}

/**
 * Resets the manually-entered line description when the product changes.
 *
 * Classic product callouts (SL_Order_Product / SL_Invoice_Product) recompute
 * price, discount and tax on product change but never touch description, so
 * without this guard the grid keeps showing the previous product's
 * description instead of clearing it for re-entry (ETP-4723).
 *
 * Mutates result in place.
 */
export function resetDescriptionOnProductChange(result, field) {
  if (field === 'product' && result.description == null) {
    result.description = '';
  }
}

/**
 * Rounds amount fields to 2 decimal places.
 * Classic callouts sometimes return values with many decimals.
 * Mutates result in place.
 */
export function roundAmounts(result) {
  for (const key of AMT_KEYS) {
    if (result[key] != null) {
      result[key] = parseFloat(Number(result[key]).toFixed(2));
    }
  }
}

/**
 * Returns true when a secondary callout to SL_Order_Amt is needed.
 *
 * SL_Order_Product (product selection) sets unitPrice/grossUnitPrice but
 * does not compute lineNetAmount. The cascade fires SL_Order_Amt to fill
 * the gap — mirroring classic Etendo browser behaviour.
 *
 * The check on lineNetAmt covers the OBDal property name variant returned
 * by NeoCalloutService.inpToCleanName().
 */
export function shouldFireCascade(result) {
  const priceUpdated    = result.unitPrice != null || result.grossUnitPrice != null;
  const lineNetFromResult = result.lineNetAmount ?? result.lineNetAmt;
  const amountNotComputed = lineNetFromResult == null || Number(lineNetFromResult) === 0;
  return priceUpdated && amountNotComputed;
}

/**
 * Merges the primary callout result into the form state for the cascade call.
 * Identifier fields are excluded — the cascade endpoint does not need display labels.
 */
export function buildCascadeState(primaryResult, formStateForCallout) {
  const cascadeState = { ...formStateForCallout };
  for (const [k, v] of Object.entries(primaryResult)) {
    if (!k.includes('$_identifier')) cascadeState[k] = v;
  }
  return cascadeState;
}

/**
 * Chooses which field + value to pass as the trigger for the SL_Order_Amt cascade.
 *
 * Tax-inclusive price lists: trigger via Gross_Unit_Price so SL_Order_Amt derives
 * PriceActual (net) correctly. Regular price lists: trigger via PriceActual.
 *
 * @param {object} primaryResult   First callout result
 * @param {Array}  addLineFields   addLineFields.entry config array
 * @returns {{ field: string, value: string }}
 */
export function selectCascadeField(primaryResult, addLineFields) {
  const useGross = primaryResult.grossUnitPrice != null;
  if (useGross) {
    const col = (addLineFields ?? []).find(f => f.key === 'grossUnitPrice')?.column ?? 'inpgrossUnitPrice';
    return { field: col, value: String(primaryResult.grossUnitPrice ?? '') };
  }
  const col = (addLineFields ?? []).find(f => f.key === 'unitPrice')?.column ?? 'PriceActual';
  const value = primaryResult.netUnitPrice ?? primaryResult.unitPrice ?? primaryResult.grossUnitPrice;
  return { field: col, value: String(value ?? '') };
}

/**
 * Fills missing $_identifier values from rowValues snapshot hints.
 *
 * When a selector fires field='product' and returns result key='uOM', a hint
 * may have been stored as rowValues['product_uOM'] = "Unit" during selection.
 * This avoids a round-trip to resolve the display name.
 * Mutates result in place.
 */
export function resolveSnapshotIdentifiers(result, field, rowValues) {
  for (const key of Object.keys(result)) {
    if (key.includes('$_identifier')) continue;
    if (result[key + '$_identifier']) continue;
    const hint = rowValues[field + '_' + key];
    if (hint && typeof hint === 'string') result[key + '$_identifier'] = hint;
  }
}
