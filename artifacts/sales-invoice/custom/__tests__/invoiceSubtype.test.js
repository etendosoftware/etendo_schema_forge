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

  // ETP-4738: Factura Rectificativa (unified credit-note doc type) has a name
  // that does NOT contain "credit"/"memo"/"crédito"/"return"/"devoluci" — the
  // identifier fallback alone would misclassify it as FAC. The server-injected
  // arInvoiceSubtype must be the deciding signal for this doc type.
  it('resolves NC via arInvoiceSubtype for "Factura Rectificativa" — an identifier the fallback regex does not recognize', () => {
    assert.equal(
      getArSubtype({ arInvoiceSubtype: 'NC', 'transactionDocument$_identifier': 'Factura Rectificativa' }),
      'NC',
    );
  });

  it('without arInvoiceSubtype, "Factura Rectificativa" falls back to FAC (documents the gap the subtype field closes)', () => {
    assert.equal(
      getArSubtype({ 'transactionDocument$_identifier': 'Factura Rectificativa' }),
      'FAC',
    );
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
