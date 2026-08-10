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

  // ETP-4737: the former separate 'NC' (credit note) and 'DEV' (return
  // invoice) subtypes are unified into a single 'RECTIFICATIVA' subtype.
  // The server-injected `arInvoiceSubtype` field is returned verbatim,
  // whatever value it carries — the unification happens upstream, in the
  // handler that populates this field.
  it('returns arInvoiceSubtype directly when present', () => {
    assert.equal(getArSubtype({ arInvoiceSubtype: 'RECTIFICATIVA' }), 'RECTIFICATIVA');
    assert.equal(getArSubtype({ arInvoiceSubtype: 'FAC' }), 'FAC');
  });

  it('prefers arInvoiceSubtype over identifier fallback', () => {
    assert.equal(
      getArSubtype({ arInvoiceSubtype: 'RECTIFICATIVA', 'transactionDocument$_identifier': 'Standard Invoice' }),
      'RECTIFICATIVA',
    );
    assert.equal(
      getArSubtype({ arInvoiceSubtype: 'FAC', 'transactionDocument$_identifier': 'Credit Memo' }),
      'FAC',
    );
  });

  it('falls back to identifier: legacy credit-memo (former NC) wording → RECTIFICATIVA', () => {
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Credit Memo' }), 'RECTIFICATIVA');
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Nota de Crédito' }), 'RECTIFICATIVA');
    assert.equal(getArSubtype({ 'cDocTypeTargetId$_identifier': 'credit note' }), 'RECTIFICATIVA');
    assert.equal(getArSubtype({ 'cDocTypeTargetId$_identifier': 'memo' }), 'RECTIFICATIVA');
  });

  it('falls back to identifier: legacy return-invoice (former DEV) wording → RECTIFICATIVA', () => {
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Return Invoice' }), 'RECTIFICATIVA');
    assert.equal(getArSubtype({ 'cDocTypeTargetId$_identifier': 'Factura de Devolución' }), 'RECTIFICATIVA');
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'devolucion de venta' }), 'RECTIFICATIVA');
  });

  it('falls back to identifier: new unified "Factura Rectificativa" wording → RECTIFICATIVA', () => {
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Factura Rectificativa' }), 'RECTIFICATIVA');
    assert.equal(getArSubtype({ 'cDocTypeTargetId$_identifier': 'FR - Factura Rectificativa' }), 'RECTIFICATIVA');
  });

  it('returns FAC when identifier does not match any known pattern', () => {
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Standard Invoice' }), 'FAC');
    assert.equal(getArSubtype({ 'transactionDocument$_identifier': 'Factura' }), 'FAC');
    assert.equal(getArSubtype({}), 'FAC');
  });
});
