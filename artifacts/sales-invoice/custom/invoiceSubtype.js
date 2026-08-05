/**
 * Resolves the AR invoice subtype from a record object.
 *
 * ETP-4737: the former separate 'NC' (credit note) and 'DEV' (return invoice)
 * subtypes are unified into a single 'RECTIFICATIVA' subtype, backed either by
 * the new "Factura Rectificativa" doc type (EM_Etsg_Isrectificative='Y' on
 * C_DocType) or, for backward compatibility with historical invoices, by
 * either legacy doc type (AR Credit Memo / Return Material Sales Invoice).
 *
 * Prefers the server-injected `arInvoiceSubtype` virtual field.
 * Falls back to inferring from the doc type identifier when the handler
 * has not yet been compiled/deployed — prevents rectificative invoices from
 * displaying as FAC because the identifier never contains a recognizable hint.
 *
 * @param {object|null|undefined} row
 * @returns {'FAC'|'RECTIFICATIVA'}
 */
export function getArSubtype(row) {
  if (!row) return 'FAC';
  if (row.arInvoiceSubtype) return row.arInvoiceSubtype;
  // Fallback: infer from the doc type name (English or Spanish identifier)
  const ident = (
    row['transactionDocument$_identifier'] ||
    row['cDocTypeTargetId$_identifier'] ||
    ''
  ).toLowerCase();
  if (
    ident.includes('rectificativ') ||
    ident.includes('credit') || ident.includes('memo') || ident.includes('crédito') ||
    ident.includes('return') || ident.includes('devoluci')
  ) {
    return 'RECTIFICATIVA';
  }
  return 'FAC';
}
