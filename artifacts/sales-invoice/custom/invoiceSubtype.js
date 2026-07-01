/**
 * Resolves the AR invoice subtype from a record object.
 *
 * Prefers the server-injected `arInvoiceSubtype` virtual field.
 * Falls back to inferring from the doc type identifier when the handler
 * has not yet been compiled/deployed — prevents DEV invoices from displaying
 * as FAC because the identifier never contains "credit".
 *
 * @param {object|null|undefined} row
 * @returns {'FAC'|'NC'|'DEV'}
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
  if (ident.includes('credit') || ident.includes('memo') || ident.includes('crédito')) return 'NC';
  if (ident.includes('return') || ident.includes('devoluci')) return 'DEV';
  return 'FAC';
}
