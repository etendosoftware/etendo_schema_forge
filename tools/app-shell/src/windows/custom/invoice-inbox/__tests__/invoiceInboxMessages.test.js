// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxMessages.js
// New file justification: no existing test covers the messages module (the locales test only reads keys).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCARD_ERROR_LABEL_KEYS, DISCARD_FALLBACK_KEY, DISCARD_STOPPING_CODES,
  discardFailureCode, discardReasonKey,
  CONFIRM_ERROR_LABEL_KEYS, CONFIRM_FALLBACK_KEY, CONFIRM_SEVERAL_KEY, CONFIRM_STOPPING_CODES, confirmReasonKey,
  CONFIRM_FAILED_DETAIL_KEYS, CONFIRM_STEP_KEYS, confirmFailedDetail,
} from '../invoiceInboxMessages.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('confirmFailedDetail (the failure identifier, ETP-6051)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const locales = Object.fromEntries(['en_US', 'es_ES', 'es_AR'].map((l) => [
    l, JSON.parse(readFileSync(join(here, '..', '..', '..', '..', 'locales', `${l}.json`), 'utf8')).genericLabels,
  ]));
  // a ui() that interpolates `{name}` from the given locale
  const uiOf = (locale) => (key, params = {}) => String(locales[locale][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');

  it('every code the backend writes and every step has a translation in the three locales', () => {
    const codes = ['no_lookups', 'completion_error', 'no_vendor_category', 'no_product_sequence', 'no_file', 'attach_failed',
      'currency_mismatch', 'total_mismatch', 'step_failed', 'search_key_exists', 'refused'];
    assert.deepEqual(Object.keys(CONFIRM_FAILED_DETAIL_KEYS).sort(), [...codes].sort());
    assert.deepEqual(Object.keys(CONFIRM_STEP_KEYS).sort(), ['creation', 'header', 'line', 'product', 'vendor', 'vendorAddress']);
    for (const locale of Object.keys(locales)) {
      for (const key of [...Object.values(CONFIRM_FAILED_DETAIL_KEYS), ...Object.values(CONFIRM_STEP_KEYS)]) {
        assert.ok(String(locales[locale][key] ?? '').trim(), `${locale}.${key}`);
      }
    }
  });

  it('translates a step failure with its translated step, reason and missing fields', () => {
    const info = { code: 'step_failed', params: { step: 'line', n: 2, reason: 'Required fields are missing', missing: ['unitPrice', 'tax'] } };
    assert.equal(confirmFailedDetail(uiOf('es_ES'), info), 'Línea 2: Required fields are missing (unitPrice, tax)');
    assert.equal(confirmFailedDetail(uiOf('en_US'), info), 'Line 2: Required fields are missing (unitPrice, tax)');
    assert.equal(confirmFailedDetail(uiOf('es_ES'), { code: 'step_failed', params: { step: 'product', name: 'Cable', reason: 'x' } }), "Nuevo producto 'Cable': x");
    assert.equal(confirmFailedDetail(uiOf('es_ES'), { code: 'step_failed', params: { step: 'weird', reason: 'x' } }), 'Creación: x');
  });

  it('translates the codes with their params', () => {
    assert.match(confirmFailedDetail(uiOf('es_ES'), { code: 'total_mismatch', params: { invoice: '121.02', document: '121.00' } }), /121\.02.*121\.00/);
    assert.equal(confirmFailedDetail(uiOf('es_AR'), { code: 'search_key_exists', params: { step: 'product', name: 'Cable' } }), "Nuevo producto 'Cable': la clave de búsqueda ya existe");
    assert.equal(confirmFailedDetail(uiOf('es_ES'), { code: 'refused', params: { message: 'Período cerrado' } }), 'Período cerrado');
    assert.equal(confirmFailedDetail(uiOf('en_US'), { code: 'no_file', params: {} }), 'The original file of the document is no longer available.');
  });

  it('an unknown code falls back to params.reason, params.message, then text', () => {
    const ui = uiOf('es_ES');
    assert.equal(confirmFailedDetail(ui, { code: 'brand_new', params: { reason: 'r', message: 'm' }, text: 't' }), 'r');
    assert.equal(confirmFailedDetail(ui, { code: 'brand_new', params: { message: 'm' }, text: 't' }), 'm');
    assert.equal(confirmFailedDetail(ui, { code: 'brand_new', params: {}, text: 't' }), 't');
    assert.equal(confirmFailedDetail(ui, { code: 'brand_new' }), null);
  });

  it('without an identifier it shows the legacy free text as it is, or nothing', () => {
    const ui = uiOf('es_ES');
    assert.equal(confirmFailedDetail(ui, null, 'line 2: tax is required'), 'line 2: tax is required');
    assert.equal(confirmFailedDetail(ui, undefined, '   '), null);
    assert.equal(confirmFailedDetail(ui, null), null);
  });
});
