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
