/**
 * Resolves the AP invoice subtype from a record object.
 *
 * Prefers the server-injected `apInvoiceSubtype` virtual field.
 * Falls back to inferring from the doc type identifier when the handler
 * has not yet been compiled/deployed.
 *
 * @param {object|null|undefined} row
 * @returns {'FAC'|'NC'}
 */
export function getApSubtype(row) {
  if (!row) return 'FAC';
  if (row.apInvoiceSubtype) return row.apInvoiceSubtype;
  const ident = (
    row['transactionDocument$_identifier'] ||
    row['cDocTypeTargetId$_identifier'] ||
    ''
  ).toLowerCase();
  if (ident.includes('credit') || ident.includes('memo') || ident.includes('crédito')) return 'NC';
  return 'FAC';
}
