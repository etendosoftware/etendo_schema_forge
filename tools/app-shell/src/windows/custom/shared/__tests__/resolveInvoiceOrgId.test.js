import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInvoiceOrgId } from '../resolveInvoiceOrgId.js';

describe('resolveInvoiceOrgId', () => {
  it('prefers the invoice record adOrgId over the fallback', () => {
    assert.equal(resolveInvoiceOrgId({ adOrgId: 'ORG-INVOICE' }, 'ORG-SELECTED'), 'ORG-INVOICE');
  });

  it('falls back to the given org id when the record has no adOrgId', () => {
    assert.equal(resolveInvoiceOrgId({}, 'ORG-SELECTED'), 'ORG-SELECTED');
  });

  it('falls back when data is null/undefined', () => {
    assert.equal(resolveInvoiceOrgId(null, 'ORG-SELECTED'), 'ORG-SELECTED');
    assert.equal(resolveInvoiceOrgId(undefined, 'ORG-SELECTED'), 'ORG-SELECTED');
  });

  it('returns null when neither the record nor the fallback carry an org', () => {
    assert.equal(resolveInvoiceOrgId({}, null), null);
    assert.equal(resolveInvoiceOrgId({}, undefined), null);
  });
});
