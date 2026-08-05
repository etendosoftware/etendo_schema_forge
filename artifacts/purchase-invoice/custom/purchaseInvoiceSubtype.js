/**
 * Resolves the AP invoice subtype from a record object.
 *
 * Prefers the server-injected `apInvoiceSubtype` virtual field, which the backend
 * (PurchaseInvoiceHeaderHandler) already collapses into a single unified value:
 * `EM_Etsg_Isrectificative = 'Y'` (ETP-4737 "Factura Rectificativa") on the new doc
 * type, OR the legacy fallback — APC (AP CreditMemo, now deactivated but still
 * resolvable for historical invoices) OR API+isReturn (Return Invoice) — both map to
 * `RECTIFICATIVA`. There is no separate DEV subtype on the purchase side (purchases
 * never had one).
 *
 * Falls back to inferring from the doc type identifier when the handler has not yet
 * been compiled/deployed. The keyword list mirrors `classifyDocType` in
 * `PurchaseInvoiceHeaderHandler` (com.etendoerp.go): credit-memo AND return/reversal
 * identifiers both collapse into RECTIFICATIVA, matching APC and API+isReturn.
 *
 * @param {object|null|undefined} row
 * @returns {'FAC'|'RECTIFICATIVA'}
 */
export function getApSubtype(row) {
  if (!row) return 'FAC';
  if (row.apInvoiceSubtype) return row.apInvoiceSubtype;
  const ident = (
    row['transactionDocument$_identifier'] ||
    row['cDocTypeTargetId$_identifier'] ||
    ''
  ).toLowerCase();
  if (
    ident.includes('rectificativ')
    || ident.includes('credit')
    || ident.includes('memo')
    || ident.includes('crédito')
    || ident.includes('return')
    || ident.includes('devoluci')
    || ident.includes('revers')
  ) {
    return 'RECTIFICATIVA';
  }
  return 'FAC';
}
