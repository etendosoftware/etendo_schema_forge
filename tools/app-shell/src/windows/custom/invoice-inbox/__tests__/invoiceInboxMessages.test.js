// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxMessages.js
// New file justification: no existing test covers the messages module (the locales test only reads keys).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCARD_ERROR_LABEL_KEYS, DISCARD_FALLBACK_KEY, DISCARD_STOPPING_CODES,
  discardFailureCode, discardReasonKey,
  CONFIRM_ERROR_LABEL_KEYS, CONFIRM_FALLBACK_KEY, CONFIRM_SEVERAL_KEY, CONFIRM_STOPPING_CODES, confirmReasonKey,
} from '../invoiceInboxMessages.js';

describe('discardFailureCode', () => {
  it('prefers the envelope code', () => {
    assert.equal(discardFailureCode({ code: 'not_discardable', httpStatus: 409 }), 'not_discardable');
    assert.equal(discardFailureCode({ code: 'org_not_allowed', httpStatus: 403 }), 'org_not_allowed');
  });
  it('derives access_denied from a code-less 403 and not_found from a 404', () => {
    assert.equal(discardFailureCode({ code: null, httpStatus: 403 }), 'access_denied');
    assert.equal(discardFailureCode({ code: null, httpStatus: 404 }), 'not_found');
  });
  it('is null for anything else', () => {
    assert.equal(discardFailureCode({ code: null, httpStatus: 500 }), null);
    assert.equal(discardFailureCode({ httpStatus: 409 }), null);
  });
});

describe('discardReasonKey', () => {
  it('maps every known code to its key', () => {
    for (const [code, key] of Object.entries(DISCARD_ERROR_LABEL_KEYS)) assert.equal(discardReasonKey(code), key);
    assert.equal(discardReasonKey('not_discardable'), 'invoiceInboxDiscardReasonNotDiscardable');
  });
  it('falls back for unknown or null codes', () => {
    assert.equal(discardReasonKey('weird'), DISCARD_FALLBACK_KEY);
    assert.equal(discardReasonKey(null), DISCARD_FALLBACK_KEY);
    assert.equal(discardReasonKey(undefined), DISCARD_FALLBACK_KEY);
  });
});

describe('DISCARD_STOPPING_CODES', () => {
  it('stops on feature_disabled and access_denied only', () => {
    assert.deepEqual([...DISCARD_STOPPING_CODES].sort(), ['access_denied', 'feature_disabled']);
    assert.equal(DISCARD_STOPPING_CODES.has('org_not_allowed'), false);
    assert.equal(DISCARD_STOPPING_CODES.has('not_discardable'), false);
  });
});

describe('confirmReasonKey / CONFIRM_STOPPING_CODES', () => {
  it('maps every known confirm code to its key', () => {
    for (const [code, key] of Object.entries(CONFIRM_ERROR_LABEL_KEYS)) assert.equal(confirmReasonKey(code), key, code);
    assert.equal(confirmReasonKey('price_list_tax_included'), 'invoiceInboxConfirmReasonPriceListTax');
    assert.equal(confirmReasonKey('QUOTA_EXCEEDED'), 'invoiceInboxConfirmReasonQuota');
  });
  it('falls back for unknown, invalid_request and null codes', () => {
    for (const code of ['weird', 'invalid_request', null, undefined]) assert.equal(confirmReasonKey(code), CONFIRM_FALLBACK_KEY, String(code));
    assert.notEqual(CONFIRM_SEVERAL_KEY, CONFIRM_FALLBACK_KEY);
  });
  it('stops on feature_disabled, access_denied and QUOTA_EXCEEDED only', () => {
    assert.deepEqual([...CONFIRM_STOPPING_CODES].sort(), ['QUOTA_EXCEEDED', 'access_denied', 'feature_disabled']);
    for (const code of ['org_not_allowed', 'price_list_tax_included', 'duplicate_invoice', 'missing_exchange_rate', 'vendor_address_missing', 'not_valid', 'confirm_failed']) {
      assert.equal(CONFIRM_STOPPING_CODES.has(code), false, code);
    }
  });
  it('a code-less 403 / 404 derive access_denied / not_found, which have confirm reasons', () => {
    assert.equal(confirmReasonKey(discardFailureCode({ code: null, httpStatus: 403 })), 'invoiceInboxConfirmReasonAccess');
    assert.equal(confirmReasonKey(discardFailureCode({ code: null, httpStatus: 404 })), 'invoiceInboxDiscardReasonNotFound');
  });
});
