import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getArSubtype } from '../invoiceSubtype.js';

describe('getArSubtype', () => {
  it('returns FAC for null row', () => {
    assert.equal(getArSubtype(null), 'FAC');
  });

  it('returns FAC for undefined row', () => {
    assert.equal(getArSubtype(undefined), 'FAC');
  });

  it('returns arInvoiceSubtype directly when present', () => {
    assert.equal(getArSubtype({ arInvoiceSubtype: 'NC' }), 'NC');
    assert.equal(getArSubtype({ arInvoiceSubtype: 'DEV' }), 'DEV');
    assert.equal(getArSubtype({ arInvoiceSubtype: 'FAC' }), 'FAC');
  });

  it('prefers arInvoiceSubtype over identifier fallback', () => {
    assert.equal(getArSubtype({ arInvoiceSubtype: 'DEV', 'transactionDocument$_identifier': 'Credit Memo' }), 'DEV');
  });

  it('falls back to transactionDocument identifier: credit → NC', () => {
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Credit Memo' }), 'NC');
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Nota de Crédito' }), 'NC');
  });

  it('falls back to cDocTypeTargetId identifier: credit → NC', () => {
    assert.equal(getArSubtype({ 'cDocTypeTargetId$_identifier': 'credit note' }), 'NC');
    assert.equal(getArSubtype({ 'cDocTypeTargetId$_identifier': 'memo' }), 'NC');
  });

  it('falls back to identifier: return/devolución → DEV', () => {
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Return Invoice' }), 'DEV');
    assert.equal(getArSubtype({ 'cDocTypeTargetId$_identifier': 'Factura de Devolución' }), 'DEV');
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'devolucion de venta' }), 'DEV');
  });

  it('returns FAC when identifier does not match any known pattern', () => {
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Standard Invoice' }), 'FAC');
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Factura' }), 'FAC');
    assert.equal(getArSubtype({}), 'FAC');
  });
});
