/**
 * ETP-5295 — single source for "what follow-up work is still pending on this order?".
 *
 * Sales/purchase orders answer that question on three surfaces: the list row kebab
 * (`useOrderWindow.jsx`), the detail-page topbar button (`OrderCreateInvoice.jsx` /
 * `PurchaseOrderActions.jsx`) and the row-kebab launcher (`ManageDocsLauncher`, exported by
 * those same two files). They used to answer it in three different ways — the kebab read the
 * list's `DeliveryStatus` / `InvoiceStatus` percent columns, the other two derived it from the
 * order's real shipments/receipts, invoices and line quantities. The percents disagree with the
 * real rule (a DRAFT shipment or invoice already covers the pending work while the percent still
 * reads < 100), so the kebab offered items whose launcher then closed silently, hid items the
 * detail form still offered, and could promise sections the modal would not render.
 *
 * The rule now lives in ONE place: `AbstractOrderHeaderHandler.afterHandle()` annotates every
 * order GET record (single and batch) with `needsPrimaryDoc` (shipment for sales / receipt for
 * purchase) and `needsInvoiceDoc`, computed with the same formula the detail form applies. This
 * module is the frontend's reader for those two annotations — it is deliberately the only place
 * that knows their names and their wire shape.
 */

/** The two GET annotations this module reads, in their backend spelling. */
export const NEEDS_PRIMARY_DOC = 'needsPrimaryDoc';
export const NEEDS_INVOICE_DOC = 'needsInvoiceDoc';

/**
 * Coerce one Etendo boolean annotation.
 *
 * An Etendo boolean reaches the frontend either as a real JSON boolean (`JSONObject.put(String,
 * boolean)`, which is how `hasLinkedDocuments` is written today) or as the AD `'Y'`/`'N'` string,
 * depending on whether it is an annotation or a mapped column. The generated `HeaderPage.jsx`
 * already encodes that duality for `hasLinkedDocuments`
 * (`data?.hasLinkedDocuments === 'Y' || data?.hasLinkedDocuments === true`), so this accepts both.
 * A plain `!!value` would be wrong: it reads the string `'N'` as true.
 *
 * @param {*} value raw annotation value off the record
 * @returns {boolean|undefined} `true`/`false` when the record carries the annotation,
 *   `undefined` when it does not — so each caller can pick its own fallback.
 */
export function readAnnotatedFlag(value) {
  if (value === true || value === 'Y') return true;
  if (value === false || value === 'N') return false;
  return undefined;
}

/**
 * Read both pending-document annotations off an order record (a list row or a header record —
 * the same handler annotates both).
 *
 * @param {object} [record]
 * @returns {{ needsPrimaryDoc: boolean|undefined, needsInvoiceDoc: boolean|undefined }}
 */
export function readOrderPendingDocs(record) {
  return {
    needsPrimaryDoc: readAnnotatedFlag(record?.[NEEDS_PRIMARY_DOC]),
    needsInvoiceDoc: readAnnotatedFlag(record?.[NEEDS_INVOICE_DOC]),
  };
}
