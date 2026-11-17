/**
 * ETP-6099 — the pricing context the invoice-line price callout needs in the «Importar desde…»
 * popups that price movement lines client-side (sales-invoice ImportFromShipmentModal /
 * ImportFromReturnShipmentModal, purchase-invoice ImportFromGoodsReceiptModal /
 * ImportFromGoodsReturnModal): the invoice header (its price list, currency, partner…) and the
 * product selector's `_aux` values (`product_PSTD`, `product_UOM`, …) the callout reads as
 * auxiliary inputs.
 *
 * Opening a popup no longer reads either: they are loaded ONCE per popup, on the first expand or
 * import that prices a line, and cached on the popup's `sharedContext`.
 *
 * Plain module over an injected `apiFetch` (docs/request-policy.md): the popups hand in their
 * module `apiFetch`, a `node --test` a stub. A failed read degrades to an empty header / no aux
 * values, as the popups did when they read these at opening.
 */

/** The invoice header and the product `_aux` map of `spec`'s invoice `invoiceId`. */
export async function loadPricingContext({ apiFetch, base, spec, invoiceId }) {
  let invoiceHeader = {};
  try {
    const headerRes = await apiFetch(`${base}/${spec}/header/${invoiceId}`);
    if (headerRes.ok) invoiceHeader = (await headerRes.json())?.response?.data?.[0] || {};
  } catch { /* degrade: the callout prices without the header */ }

  const productAuxMap = {};
  try {
    const priceListId = invoiceHeader.priceList;
    const priceListParam = priceListId ? '&priceList=' + encodeURIComponent(priceListId) : '';
    const selectorUrl = `${base}/${spec}/lines/selectors/M_Product_ID?limit=500&offset=0${priceListParam}`;
    const selectorRes = await apiFetch(selectorUrl);
    if (selectorRes.ok) {
      const selData = await selectorRes.json();
      for (const item of (selData?.items || [])) {
        if (item.id && item._aux) {
          const aux = {};
          for (const [suffix, val] of Object.entries(item._aux)) {
            aux[`product${suffix}`] = val;
          }
          productAuxMap[item.id] = aux;
        }
      }
    }
  } catch { /* degrade: no auxiliary product values */ }
  return { invoiceHeader, productAuxMap };
}

/**
 * The popup's pricing context: the one the caller already put on `sharedContext`
 * (`invoiceHeader` + `productAuxMap`), else loaded on first use for `sharedContext.invoiceId` and
 * cached on it (`sharedContext.pricing`), so every later expand/import reuses the same promise.
 */
export function pricingContextOf({ apiFetch, base, spec, sharedContext }) {
  if (sharedContext.invoiceHeader) return sharedContext;
  sharedContext.pricing ??= loadPricingContext({ apiFetch, base, spec, invoiceId: sharedContext.invoiceId });
  return sharedContext.pricing;
}
