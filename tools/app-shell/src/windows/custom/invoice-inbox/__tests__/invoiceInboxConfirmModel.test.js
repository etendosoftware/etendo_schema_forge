// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxConfirmModel.js
// New file justification: invoiceInboxConfirmModel.js is a new module; no existing test covers it
// (invoiceInboxReviewModel.test.js and invoiceInboxFilters.test.js are about other units).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeConfirm, contiguousRange, numberingText, confirmToastText, nextPendingRow, singleConfirmResult,
  isTotalMismatch, rowCurrencyCode, TOAST_LISTED_NUMBERS,
} from '../invoiceInboxConfirmModel.js';

/** ui stub: the key plus its params, so the tests assert the key and the numbers the toast passes. */
const ui = (key, params) => (params ? `${key}(${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')})` : key);

const row = (id, status, extra = {}) => ({ id, status, ...extra });

describe('rowCurrencyCode / isTotalMismatch', () => {
  it('reads an ISO string, an isoCode object, the identifier, else null', () => {
    assert.equal(rowCurrencyCode({ currency: 'USD' }), 'USD');
    assert.equal(rowCurrencyCode({ currency: { isoCode: 'GBP' } }), 'GBP');
    assert.equal(rowCurrencyCode({ currency: '102', 'currency$_identifier': 'EUR' }), 'EUR');
    assert.equal(rowCurrencyCode({ currency: '102', 'currency$_identifier': ' EUR ' }), 'EUR');
    assert.equal(rowCurrencyCode({ currency: '102' }), null);
    assert.equal(rowCurrencyCode({}), null);
    assert.equal(rowCurrencyCode(null), null);
    assert.equal(rowCurrencyCode({ 'currency$_identifier': 'Euro' }), null);
  });
  it('is true for true, Y and "true" only', () => {
    for (const v of [true, 'Y', 'true']) assert.equal(isTotalMismatch(v), true, String(v));
    for (const v of [null, undefined, '', 'N', 'false', false, 0, 1, 'y']) assert.equal(isTotalMismatch(v), false, String(v));
  });
});

describe('summarizeConfirm', () => {
  it('sums per currency in integer micro-units (0.1 + 0.2 is 0.3)', () => {
    const s = summarizeConfirm([
      row('1', 'READY', { grandTotalAmount: 0.1, currency: 'EUR' }),
      row('2', 'READY', { grandTotalAmount: 0.2, currency: 'EUR' }),
    ], 'EUR');
    assert.deepEqual(s.totals, [{ currency: 'EUR', amount: 0.3 }]);
    assert.equal(s.confirmable.length, 2);
  });
  it('keeps one entry per currency in order of first appearance', () => {
    const s = summarizeConfirm([
      row('1', 'READY', { grandTotalAmount: 10, currency: 'USD' }),
      row('2', 'PENDING_REVIEW', { grandTotalAmount: 5, currency: 'EUR' }),
      row('3', 'READY', { grandTotalAmount: 7, currency: 'USD' }),
    ], 'EUR');
    assert.deepEqual(s.totals, [{ currency: 'USD', amount: 17 }, { currency: 'EUR', amount: 5 }]);
  });
  it('falls back to the organization currency for a row with none', () => {
    const s = summarizeConfirm([row('1', 'READY', { grandTotalAmount: 3 })], 'ARS');
    assert.deepEqual(s.totals, [{ currency: 'ARS', amount: 3 }]);
  });
  it('counts skipped rows and ignores their amounts, products and mismatch', () => {
    const s = summarizeConfirm([
      row('1', 'READY', { grandTotalAmount: 10, newProducts: 2, totalMismatch: 'Y' }),
      row('2', 'CONFIRMED', { grandTotalAmount: 99, newProducts: 9, totalMismatch: 'Y' }),
      row('3', 'ERROR', { errorCode: 'UNREADABLE', grandTotalAmount: 50 }),
      row('4', 'PROCESSING'),
      row('5', 'DISCARDED'),
    ], 'EUR');
    assert.equal(s.confirmable.length, 1);
    assert.equal(s.skipped, 4);
    assert.equal(s.newProducts, 2);
    assert.equal(s.mismatches, 1);
    assert.deepEqual(s.totals, [{ currency: 'EUR', amount: 10 }]);
  });
  it('treats CONFIRM_FAILED and MISSING_FIELDS errors as confirmable', () => {
    const s = summarizeConfirm([
      row('1', 'ERROR', { errorCode: 'CONFIRM_FAILED', grandTotalAmount: 1 }),
      row('2', 'ERROR', { errorCode: 'MISSING_FIELDS', grandTotalAmount: 1 }),
      row('3', 'ERROR', { errorCode: 'SERVICE_FAILURE', grandTotalAmount: 1 }),
    ], 'EUR');
    assert.deepEqual(s.confirmable.map((r) => r.id), ['1', '2']);
    assert.equal(s.skipped, 1);
  });
  it('ignores a non-numeric or negative newProducts and a non-numeric amount', () => {
    const s = summarizeConfirm([
      row('1', 'READY', { grandTotalAmount: 'abc', newProducts: 'x' }),
      row('2', 'READY', { grandTotalAmount: null, newProducts: -3 }),
      row('3', 'READY', { grandTotalAmount: 4, newProducts: '3' }),
    ], 'EUR');
    assert.equal(s.newProducts, 3);
    assert.deepEqual(s.totals, [{ currency: 'EUR', amount: 4 }]);
  });
  it('is empty for no rows', () => {
    assert.deepEqual(summarizeConfirm(undefined, 'EUR'), { confirmable: [], skipped: 0, totals: [], newProducts: 0, mismatches: 0 });
  });
});

describe('contiguousRange / numberingText', () => {
  it('detects a contiguous run, in any order', () => {
    assert.deepEqual(contiguousRange(['FC1000143', 'FC1000144', 'FC1000145']), { from: 'FC1000143', to: 'FC1000145' });
    assert.deepEqual(contiguousRange(['FC1000145', 'FC1000143', 'FC1000144']), { from: 'FC1000143', to: 'FC1000145' });
  });
  it('is null for a gap, a different prefix, a different width, no digits and a single number', () => {
    assert.equal(contiguousRange(['FC1', 'FC3']), null);
    assert.equal(contiguousRange(['FC1', 'FD2']), null);
    assert.equal(contiguousRange(['FC9', 'FC10']), null);
    assert.equal(contiguousRange(['FC1', 'ABC']), null);
    assert.equal(contiguousRange(['FC1']), null);
    assert.equal(contiguousRange([]), null);
  });
  it('keeps the zero padding across a width-preserving boundary (FC0999 -> FC1000)', () => {
    assert.deepEqual(contiguousRange(['FC0999', 'FC1000']), { from: 'FC0999', to: 'FC1000' });
  });
  it('splits the trailing digit run: digit-only numbers, null/empty, trailing non-digit, line terminators', () => {
    assert.deepEqual(contiguousRange(['7', '8', '9']), { from: '7', to: '9' });
    assert.deepEqual(contiguousRange(['A1B007', 'A1B008']), { from: 'A1B007', to: 'A1B008' });
    assert.equal(contiguousRange(['', '']), null);
    assert.equal(contiguousRange([null, undefined]), null);
    assert.equal(contiguousRange(['FC1 ', 'FC2 ']), null);
    assert.equal(contiguousRange(['FC\n1', 'FC\n2']), null);
    assert.equal(contiguousRange(['FC1\n2', 'FC1\n3']), null);
    assert.equal(contiguousRange(['FC1\u20282', 'FC1\u20283']), null);
  });
  it('a repeated number is not a run', () => {
    assert.equal(contiguousRange(['FC1', 'FC1']), null);
  });
  it('numberingText: one number, a range, a short list, a long list with an ellipsis, empty', () => {
    assert.equal(numberingText(['FC1'], ui), 'FC1');
    assert.equal(numberingText(['FC1', 'FC2', 'FC3'], ui), 'invoiceInboxConfirmRange(from=FC1,to=FC3)');
    assert.equal(numberingText(['FC1', 'FC5', 'FC9'], ui), 'FC1, FC5, FC9');
    const many = ['A1', 'A3', 'A5', 'A7', 'A9', 'A11'];
    assert.ok(many.length > TOAST_LISTED_NUMBERS);
    assert.equal(numberingText(many, ui), 'A1, A3, A5, A7, A9, …');
    assert.equal(numberingText(['A1', 'A3', 'A5', 'A7', 'A9'], ui), 'A1, A3, A5, A7, A9');
    assert.equal(numberingText([null, undefined], ui), '');
    assert.equal(numberingText([], ui), '');
  });
  it('numberingText drops empty numbers before choosing the form', () => {
    assert.equal(numberingText([null, 'FC7'], ui), 'FC7');
  });
});

describe('confirmToastText', () => {
  const ok = (documentNo, extra = {}) => ({ id: documentNo, documentNo, createdProducts: 0, ...extra });
  const base = { total: 0, ok: [], failed: [], stopped: null, notSent: [] };

  it('success with one invoice', () => {
    const t = confirmToastText({ ...base, total: 1, ok: [ok('FC1')] }, ui);
    assert.deepEqual(t, { tone: 'success', text: 'invoiceInboxConfirmedToastOne · FC1' });
  });
  it('success with several, a range and created products', () => {
    const t = confirmToastText({ ...base, total: 2, ok: [ok('FC1', { createdProducts: 1 }), ok('FC2', { createdProducts: 2 })] }, ui);
    assert.equal(t.tone, 'success');
    assert.equal(t.text, 'invoiceInboxConfirmedToastMany(count=2) · invoiceInboxConfirmRange(from=FC1,to=FC2) · invoiceInboxConfirmProductsMany(count=3)');
  });
  it('a single created product uses the singular key', () => {
    const t = confirmToastText({ ...base, total: 1, ok: [ok('FC1', { createdProducts: 1 })] }, ui);
    assert.match(t.text, /invoiceInboxConfirmProductsOne/);
  });
  it('a mismatch note keeps the success tone, singular and plural', () => {
    const one = confirmToastText({ ...base, total: 1, ok: [ok('FC1', { totalMismatch: true })] }, ui);
    assert.equal(one.tone, 'success');
    assert.match(one.text, /invoiceInboxConfirmMismatchOne\(count=1\)/);
    const many = confirmToastText({ ...base, total: 2, ok: [ok('FC1', { totalMismatch: true }), ok('FC2', { totalMismatch: true })] }, ui);
    assert.equal(many.tone, 'success');
    assert.match(many.text, /invoiceInboxConfirmMismatchMany\(count=2\)/);
  });
  it('some ok and some failed is a warning with singular / plural partial text and the shared reason', () => {
    const one = confirmToastText({ ...base, total: 2, ok: [ok('FC1')], failed: [{ code: 'org_not_allowed', reasonKey: 'invoiceInboxConfirmReasonOrg' }] }, ui);
    assert.equal(one.tone, 'warning');
    assert.match(one.text, /invoiceInboxConfirmPartialOne\(failed=1,reason=invoiceInboxConfirmReasonOrg\)$/);
    const many = confirmToastText({ ...base, total: 3, ok: [ok('FC1')], failed: [
      { code: 'org_not_allowed', reasonKey: 'invoiceInboxConfirmReasonOrg' },
      { code: 'org_not_allowed', reasonKey: 'invoiceInboxConfirmReasonOrg' },
    ] }, ui);
    assert.match(many.text, /invoiceInboxConfirmPartialMany\(failed=2,reason=invoiceInboxConfirmReasonOrg\)$/);
  });
  it('different failure codes show the "several reasons" key', () => {
    const t = confirmToastText({ ...base, total: 3, ok: [ok('FC1')], failed: [{ code: 'not_valid' }, { code: 'duplicate_invoice' }] }, ui);
    assert.match(t.text, /reason=invoiceInboxConfirmReasonSeveral/);
  });
  it('the reason of a code derives its key when the failure carries none', () => {
    const t = confirmToastText({ ...base, total: 1, ok: [], failed: [{ code: 'duplicate_invoice' }] }, ui);
    assert.match(t.text, /reason=invoiceInboxConfirmReasonDuplicate/);
  });
  it('no success at all is an error', () => {
    const t = confirmToastText({ ...base, total: 1, failed: [{ code: 'not_valid', reasonKey: 'invoiceInboxConfirmReasonNotValid' }] }, ui);
    assert.equal(t.tone, 'error');
    assert.equal(t.text, 'invoiceInboxConfirmFailed(reason=invoiceInboxConfirmReasonNotValid)');
  });
  it('the stopping reason wins over the common one, and a network reasonText is used as is', () => {
    const stopped = { code: 'QUOTA_EXCEEDED', reasonKey: 'invoiceInboxConfirmReasonQuota' };
    const t = confirmToastText({ ...base, total: 3, ok: [ok('FC1')], failed: [{ code: 'not_valid' }, stopped], stopped, notSent: ['3'] }, ui);
    assert.match(t.text, /reason=invoiceInboxConfirmReasonQuota/);
    const net = { code: 'network', reasonText: 'Sin conexión' };
    const n = confirmToastText({ ...base, total: 2, failed: [net], stopped: net, notSent: ['2'] }, ui);
    assert.equal(n.tone, 'error');
    assert.match(n.text, /reason=Sin conexión/);
  });
  it('documents not sent after a stop are counted apart from the failed ones', () => {
    const stopped = { code: 'feature_disabled', reasonKey: 'invoiceInboxDiscardReasonFeatureDisabled' };
    const t = confirmToastText({ ...base, total: 4, ok: [ok('FC1')], failed: [stopped], stopped, notSent: ['3', '4'] }, ui);
    assert.equal(t.tone, 'warning');
    assert.match(t.text, /invoiceInboxConfirmPartialOne\(failed=1,/);
    assert.match(t.text, /invoiceInboxConfirmNotSent\(count=2\)$/);
  });
  it('nothing failed but some unsent is a warning with the unsent count only (no reason lookup)', () => {
    const t = confirmToastText({ ...base, total: 3, ok: [ok('FC1')], notSent: ['2', '3'] }, ui);
    assert.equal(t.tone, 'warning');
    assert.match(t.text, /invoiceInboxConfirmedToastOne · FC1\. invoiceInboxConfirmNotSent\(count=2\)$/);
  });
  it('nothing ok, nothing failed, only unsent is a warning', () => {
    const t = confirmToastText({ ...base, total: 2, notSent: ['1', '2'] }, ui);
    assert.deepEqual(t, { tone: 'warning', text: 'invoiceInboxConfirmNotSent(count=2)' });
  });
});

describe('nextPendingRow / singleConfirmResult', () => {
  const rows = [row('a', 'READY'), row('b', 'CONFIRMED'), row('c', 'ERROR', { errorCode: 'UNREADABLE' }), row('d', 'PENDING_REVIEW'), row('e', 'READY')];
  it('is the first pending or ready row AFTER the current one, in list order', () => {
    assert.equal(nextPendingRow(rows, 'a').id, 'd');
    assert.equal(nextPendingRow(rows, 'd').id, 'e');
  });
  it('is null on the last pending, an unknown id and no rows', () => {
    assert.equal(nextPendingRow(rows, 'e'), null);
    assert.equal(nextPendingRow(rows, 'zzz'), null);
    assert.equal(nextPendingRow(undefined, 'a'), null);
  });
  it('does not look backwards', () => {
    assert.equal(nextPendingRow([row('a', 'READY'), row('b', 'CONFIRMED')], 'b'), null);
  });
  it('singleConfirmResult shapes one confirm answer for the toast', () => {
    assert.deepEqual(
      singleConfirmResult({ invoice: { documentNo: 'FC9' }, createdProducts: '2', totalMismatch: 'Y' }),
      { total: 1, ok: [{ documentNo: 'FC9', createdProducts: 2, totalMismatch: true }], failed: [], stopped: null, notSent: [] },
    );
    const empty = singleConfirmResult(null);
    assert.equal(empty.ok[0].documentNo, null);
    assert.equal(empty.ok[0].createdProducts, 0);
    assert.equal(empty.ok[0].totalMismatch, false);
  });
});
