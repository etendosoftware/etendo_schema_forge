import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDocTypeField, resolveDocTypeName, resolveIdentifier } from '../resolveIdentifier.js';

describe('isDocTypeField', () => {
  it('returns true for known doc-type field keys', () => {
    assert.equal(isDocTypeField('cDocTypeTargetId'), true);
    assert.equal(isDocTypeField('transactionDocument'), true);
    assert.equal(isDocTypeField('documentType'), true);
  });

  it('returns false for unrelated field keys', () => {
    assert.equal(isDocTypeField('businessPartner'), false);
    assert.equal(isDocTypeField(''), false);
  });
});

describe('resolveDocTypeName', () => {
  it('translates known English doc-type names to Spanish', () => {
    assert.equal(resolveDocTypeName('ar invoice'), 'Factura');
    assert.equal(resolveDocTypeName('ar credit memo'), 'Nota de crédito');
    assert.equal(resolveDocTypeName('ap invoice'), 'Factura de compra');
    assert.equal(resolveDocTypeName('ap credit memo'), 'Nota de crédito de compra');
    assert.equal(resolveDocTypeName('return material sales invoice'), 'Factura de devolución');
    assert.equal(resolveDocTypeName('return material receipt'), 'Factura de devolución de compra');
  });

  it('is case-insensitive', () => {
    assert.equal(resolveDocTypeName('AR Invoice'), 'Factura');
    assert.equal(resolveDocTypeName('AP INVOICE'), 'Factura de compra');
  });

  it('returns the original name when no translation exists', () => {
    assert.equal(resolveDocTypeName('custom doc type'), 'custom doc type');
  });

  it('passes null and undefined through unchanged', () => {
    assert.equal(resolveDocTypeName(null), null);
    assert.equal(resolveDocTypeName(undefined), undefined);
  });
});

describe('resolveIdentifier', () => {
  it('prefers the $_identifier property', () => {
    const row = { businessPartner$_identifier: 'Acme Corp', businessPartner: 'uuid-123' };
    assert.equal(resolveIdentifier(row, 'businessPartner'), 'Acme Corp');
  });

  it('translates doc-type identifiers via DOC_TYPE_LABELS', () => {
    const row = { cDocTypeTargetId$_identifier: 'AR Invoice' };
    assert.equal(resolveIdentifier(row, 'cDocTypeTargetId'), 'Factura');
  });

  it('falls back to the raw identifier when translation is missing for a doc-type field', () => {
    const row = { cDocTypeTargetId$_identifier: 'Custom Type' };
    assert.equal(resolveIdentifier(row, 'cDocTypeTargetId'), 'Custom Type');
  });

  it('falls back to object .name when no identifier property', () => {
    const row = { businessPartner: { id: 'uuid-123', name: 'Acme Corp' } };
    assert.equal(resolveIdentifier(row, 'businessPartner'), 'Acme Corp');
  });

  it('falls back to the raw scalar value as last resort', () => {
    const row = { status: 'CO' };
    assert.equal(resolveIdentifier(row, 'status'), 'CO');
  });

  it('returns undefined for a null row', () => {
    assert.equal(resolveIdentifier(null, 'anyKey'), undefined);
  });

  it('returns undefined when key is null', () => {
    assert.equal(resolveIdentifier({ a: 1 }, null), undefined);
  });
});
