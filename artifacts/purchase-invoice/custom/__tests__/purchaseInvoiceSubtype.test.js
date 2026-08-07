import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getApSubtype } from '../purchaseInvoiceSubtype.js';

describe('getApSubtype', () => {
  it('returns FAC for null row', () => {
    assert.equal(getApSubtype(null), 'FAC');
  });

  it('returns FAC for undefined row', () => {
    assert.equal(getApSubtype(undefined), 'FAC');
  });

  it('returns apInvoiceSubtype directly when present', () => {
    assert.equal(getApSubtype({ apInvoiceSubtype: 'RECTIFICATIVA' }), 'RECTIFICATIVA');
    assert.equal(getApSubtype({ apInvoiceSubtype: 'FAC' }), 'FAC');
  });

  it('prefers apInvoiceSubtype over identifier fallback', () => {
    assert.equal(getApSubtype({ apInvoiceSubtype: 'FAC', 'transactionDocument$_identifier': 'Credit Memo' }), 'FAC');
  });

  // ETP-4737: purchases collapse credit-memo AND return/reversal doc types into a
  // single RECTIFICATIVA subtype — there is no separate DEV/NC/return subtype on
  // the purchase side (unlike sales, purchases never had one).
  it('falls back to transactionDocument identifier: credit → RECTIFICATIVA', () => {
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'AP CreditMemo' }), 'RECTIFICATIVA');
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'Nota de Crédito de Proveedor' }), 'RECTIFICATIVA');
  });

  it('falls back to transactionDocument identifier: return/reversal → RECTIFICATIVA', () => {
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'Return Material Purchase Invoice' }), 'RECTIFICATIVA');
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'Reversed Purchase Invoice' }), 'RECTIFICATIVA');
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'Factura de Devolución' }), 'RECTIFICATIVA');
  });

  // The whole point of the fix: the new AD doc type "Factura Rectificativa
  // (compras)" is recognized via the "rectificativ" keyword, without needing an
  // exact-name entry for it — unlike the previous hardcoded name checks in
  // index.jsx/PurchaseInvoiceTopbar.jsx/RelatedDocuments.jsx, which all missed it.
  it('falls back to transactionDocument identifier: "Factura Rectificativa (compras)" → RECTIFICATIVA', () => {
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'Factura Rectificativa (compras)' }), 'RECTIFICATIVA');
  });

  it('falls back to cDocTypeTargetId identifier: credit → RECTIFICATIVA', () => {
    assert.equal(getApSubtype({ 'cDocTypeTargetId$_identifier': 'credit note' }), 'RECTIFICATIVA');
    assert.equal(getApSubtype({ 'cDocTypeTargetId$_identifier': 'memo' }), 'RECTIFICATIVA');
  });

  it('returns FAC when identifier does not match any known pattern', () => {
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'AP Invoice' }), 'FAC');
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'Factura de Proveedor' }), 'FAC');
    assert.equal(getApSubtype({}), 'FAC');
  });
});
