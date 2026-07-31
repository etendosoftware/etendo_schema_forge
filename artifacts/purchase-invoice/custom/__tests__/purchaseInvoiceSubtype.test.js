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
    assert.equal(getApSubtype({ apInvoiceSubtype: 'NC' }), 'NC');
    assert.equal(getApSubtype({ apInvoiceSubtype: 'FAC' }), 'FAC');
  });

  it('prefers apInvoiceSubtype over identifier fallback', () => {
    assert.equal(getApSubtype({ apInvoiceSubtype: 'FAC', 'transactionDocument$_identifier': 'Credit Memo' }), 'FAC');
  });

  // ETP-4738: Factura Rectificativa (unified credit-note doc type) has a name
  // that does NOT contain "credit"/"memo"/"crédito" — the identifier fallback
  // alone would misclassify it as FAC. The server-injected apInvoiceSubtype
  // (set from grandTotalAmount < 0 reclassification) must be the deciding
  // signal for this doc type.
  it('resolves NC via apInvoiceSubtype for "Factura Rectificativa" — an identifier the fallback regex does not recognize', () => {
    assert.equal(
      getApSubtype({ apInvoiceSubtype: 'NC', 'transactionDocument$_identifier': 'Factura Rectificativa' }),
      'NC',
    );
  });

  it('without apInvoiceSubtype, "Factura Rectificativa" falls back to FAC (documents the gap the subtype field closes)', () => {
    assert.equal(
      getApSubtype({ 'transactionDocument$_identifier': 'Factura Rectificativa' }),
      'FAC',
    );
  });

  it('falls back to transactionDocument identifier: credit → NC', () => {
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'AP Credit Memo' }), 'NC');
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'Nota de Crédito de Proveedor' }), 'NC');
  });

  it('falls back to cDocTypeTargetId identifier: credit → NC', () => {
    assert.equal(getApSubtype({ 'cDocTypeTargetId$_identifier': 'credit note' }), 'NC');
    assert.equal(getApSubtype({ 'cDocTypeTargetId$_identifier': 'memo' }), 'NC');
  });

  it('returns FAC when identifier does not match any known pattern', () => {
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'AP Invoice' }), 'FAC');
    assert.equal(getApSubtype({ 'transactionDocument$_identifier': 'Factura de Proveedor' }), 'FAC');
    assert.equal(getApSubtype({}), 'FAC');
  });
});
