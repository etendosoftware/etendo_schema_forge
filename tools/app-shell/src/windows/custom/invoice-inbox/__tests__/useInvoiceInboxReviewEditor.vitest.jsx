// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReviewEditor.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReview.js
// New file justification: no test covers the S2 editor hook; useInvoiceInboxReview.vitest.jsx is
// the read-only loader hook (a different unit) and the drawer tests only see it through the DOM.
import { renderHook, act, waitFor } from '@testing-library/react';

const mockFetchReview = vi.fn();
const mockApply = vi.fn();
const mockMark = vi.fn();
const mockConfirm = vi.fn();
vi.mock('../invoiceInboxApi.js', () => ({
  fetchReview: (...a) => mockFetchReview(...a),
  applyOperations: (...a) => mockApply(...a),
  markReviewed: (...a) => mockMark(...a),
  confirmInboxDocument: (...a) => mockConfirm(...a),
}));

import { useInvoiceInboxReviewEditor } from '../useInvoiceInboxReviewEditor.js';
import { buildOp } from '../invoiceInboxReviewModel.js';

const apiFetch = vi.fn();
const lineOf = (over = {}) => ({ index: 0, description: 'W', quantity: 2, unitPrice: 50, taxRate: 21, ...over });
const reviewOf = (updated, lines = [lineOf()], over = {}) => ({
  id: 'D1', status: 'PENDING_REVIEW', editable: true, updated,
  document: { header: { documentNo: 'F1' }, lines, validation: { missing: [] } }, ...over,
});
const okOutcome = (review) => ({ status: 'ok', review });
const failed = (code, extra = {}) => ({ status: 'failed', code, httpStatus: 409, field: null, index: null, missing: null, documentStatus: null, ...extra });
function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function mount(id = 'D1', review = reviewOf('T0')) {
  mockFetchReview.mockResolvedValue(okOutcome(review));
  const utils = renderHook(({ docId }) => useInvoiceInboxReviewEditor(apiFetch, docId), { initialProps: { docId: id } });
  await waitFor(() => expect(utils.result.current.review).not.toBeNull());
  return utils;
}
const qty = (r) => r.current.review.document.lines[0].quantity;

beforeEach(() => {
  mockFetchReview.mockReset(); mockApply.mockReset(); mockMark.mockReset(); mockConfirm.mockReset();
});

describe('useInvoiceInboxReviewEditor', () => {
  it('overlays the pending op at once, then the server answer replaces it and the state is saved', async () => {
    const gate = deferred();
    mockApply.mockReturnValue(gate.promise);
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 5 })); });
    expect(qty(result)).toBe(5);
    expect(result.current.serverReview.document.lines[0].quantity).toBe(2);
    expect(result.current.save.status).toBe('saving');
    expect(result.current.saving).toBe(true);
    await act(async () => { gate.resolve(okOutcome(reviewOf('T1', [lineOf({ quantity: 5 })]))); });
    await waitFor(() => expect(result.current.save.status).toBe('saved'));
    expect(qty(result)).toBe(5);
    expect(result.current.saving).toBe(false);
    expect(mockApply).toHaveBeenCalledWith(apiFetch, 'D1', 'T0', [{ op: 'setLine', index: 0, quantity: 5 }]);
  });

  it('keeps ONE write in flight and coalesces the same key (last value wins), carrying the refreshed token', async () => {
    const first = deferred();
    mockApply.mockReturnValueOnce(first.promise).mockResolvedValue(okOutcome(reviewOf('T2', [lineOf({ quantity: 9 })])));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 4 })); });
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 9 })); });
    expect(mockApply).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve(okOutcome(reviewOf('T1', [lineOf({ quantity: 3 })]))); });
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(2));
    expect(mockApply.mock.calls[1].slice(2)).toEqual(['T1', [{ op: 'setLine', index: 0, quantity: 9 }]]);
    await waitFor(() => expect(result.current.save.status).toBe('saved'));
  });

  it('structural operations carry unique keys, so none is lost to coalescing', async () => {
    const first = deferred();
    mockApply.mockReturnValueOnce(first.promise).mockResolvedValue(okOutcome(reviewOf('T9')));
    const { result } = await mount();
    act(() => { result.current.commit('addLine:1', buildOp.addLine()); });
    act(() => { result.current.commit('addLine:2', buildOp.addLine()); });
    act(() => { result.current.commit('addLine:3', buildOp.addLine()); });
    await act(async () => { first.resolve(okOutcome(reviewOf('T1'))); });
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(3));
    expect(mockApply.mock.calls.map((c) => c[3][0].op)).toEqual(['addLine', 'addLine', 'addLine']);
  });

  it('409 stale_document reloads, drops the local edits and shows a notice', async () => {
    mockApply.mockResolvedValue(failed('stale_document'));
    const { result } = await mount();
    mockFetchReview.mockResolvedValue(okOutcome(reviewOf('T7', [lineOf({ quantity: 11 })])));
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 5 })); });
    await waitFor(() => expect(result.current.notice).toEqual({ key: 'invoiceInboxSaveErrorStale' }));
    expect(qty(result)).toBe(11);
    expect(result.current.save.status).toBe('idle');
    act(() => result.current.dismissNotice());
    expect(result.current.notice).toBeNull();
    mockApply.mockResolvedValue(okOutcome(reviewOf('T8')));
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 1 })); });
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(2));
    expect(mockApply.mock.calls[1][2]).toBe('T7');
  });

  it('422 invalid_value rolls back to the last answer and exposes the reason', async () => {
    mockApply.mockResolvedValue(failed('invalid_value', { httpStatus: 422, field: 'quantity', index: 0 }));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 5 })); });
    await waitFor(() => expect(result.current.save.status).toBe('error'));
    expect(result.current.save).toMatchObject({ errorKey: 'invoiceInboxSaveErrorInvalidValue', code: 'invalid_value' });
    expect(qty(result)).toBe(2);
    expect(result.current.notice).toBeNull();
  });

  it('a network error rolls back and shows its already translated text', async () => {
    mockApply.mockRejectedValue(Object.assign(new Error('Sin conexión'), { name: 'NetworkError', code: 'NETWORK', reason: 'offline' }));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 5 })); });
    await waitFor(() => expect(result.current.save.status).toBe('error'));
    expect(result.current.save).toMatchObject({ errorText: 'Sin conexión', errorKey: null, code: 'network' });
    expect(qty(result)).toBe(2);
  });

  it('a failed write discards what was queued behind it', async () => {
    const first = deferred();
    mockApply.mockReturnValueOnce(first.promise);
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    act(() => { result.current.commit('header:documentNo', buildOp.setHeader({ documentNo: 'Z' })); });
    await act(async () => { first.resolve(failed('invalid_value', { httpStatus: 422 })); });
    await waitFor(() => expect(result.current.save.status).toBe('error'));
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(result.current.review.document.header.documentNo).toBe('F1');
  });

  it('flush waits for the queue and resolves true; false when a write failed meanwhile', async () => {
    const gate = deferred();
    mockApply.mockReturnValueOnce(gate.promise);
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    let outcome;
    let settled = false;
    const p = result.current.flush().then((v) => { outcome = v; settled = true; });
    await act(async () => { await Promise.resolve(); });
    expect(settled).toBe(false);
    await act(async () => { gate.resolve(okOutcome(reviewOf('T1', [lineOf({ quantity: 3 })]))); await p; });
    expect(outcome).toBe(true);

    mockApply.mockResolvedValueOnce(failed('invalid_value', { httpStatus: 422 }));
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 8 })); });
    let flushed;
    await act(async () => { flushed = await result.current.flush(); });
    expect(flushed).toBe(false);
  });

  it('flush asks every registered input to commit before waiting; unregister stops that', async () => {
    const { result } = await mount();
    const a = vi.fn(); const b = vi.fn();
    let offA;
    act(() => { offA = result.current.registerFlush(a); result.current.registerFlush(b); });
    await act(async () => { await result.current.flush(); });
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
    offA();
    await act(async () => { await result.current.flush(); });
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 2]);
  });

  it('commits nothing without a document and drops the pending overlay when the id changes', async () => {
    const gate = deferred();
    mockApply.mockReturnValue(gate.promise);
    const idle = renderHook(() => useInvoiceInboxReviewEditor(apiFetch, null));
    act(() => { idle.result.current.commit('k', buildOp.addLine()); });
    expect(mockApply).not.toHaveBeenCalled();
    const { result, rerender } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 5 })); });
    mockFetchReview.mockResolvedValue(okOutcome(reviewOf('B0', [lineOf({ quantity: 1 })], { id: 'D2' })));
    rerender({ docId: 'D2' });
    await waitFor(() => expect(result.current.review?.id).toBe('D2'));
    expect(qty(result)).toBe(1);
    expect(result.current.save.status).toBe('idle');
    await act(async () => { gate.resolve(okOutcome(reviewOf('X'))); });
    expect(result.current.review.id).toBe('D2');
    expect(qty(result)).toBe(1);
  });

  it('starts no write after unmount', async () => {
    const first = deferred();
    mockApply.mockReturnValueOnce(first.promise).mockResolvedValue(okOutcome(reviewOf('T2')));
    const { result, unmount } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    act(() => { result.current.commit('header:documentNo', buildOp.setHeader({ documentNo: 'Z' })); });
    unmount();
    await act(async () => { first.resolve(okOutcome(reviewOf('T1'))); });
    expect(mockApply).toHaveBeenCalledTimes(1);
  });

  it('markReviewed flushes first, then POSTs with the refreshed token and replaces the review', async () => {
    mockApply.mockResolvedValue(okOutcome(reviewOf('T1', [lineOf({ quantity: 3 })])));
    mockMark.mockResolvedValue(okOutcome(reviewOf('T2', [lineOf({ quantity: 3 })], { reviewed: true })));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    let done;
    await act(async () => { done = await result.current.markReviewed(); });
    expect(done).toBe(true);
    expect(mockApply.mock.invocationCallOrder[0]).toBeLessThan(mockMark.mock.invocationCallOrder[0]);
    expect(mockMark).toHaveBeenCalledWith(apiFetch, 'D1', 'T1');
    expect(result.current.review.reviewed).toBe(true);
    expect(result.current.marking).toBe(false);
  });

  it('markReviewed does not run when the flush failed', async () => {
    mockApply.mockResolvedValue(failed('invalid_value', { httpStatus: 422 }));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    let done;
    await act(async () => { done = await result.current.markReviewed(); });
    expect(done).toBe(false);
    expect(mockMark).not.toHaveBeenCalled();
  });

  it('markReviewed not_valid adopts the recomputed missing, the status and the NEW token locally: no reload, no loop', async () => {
    mockMark.mockResolvedValue(failed('not_valid', { httpStatus: 422, missing: ['line[0].quantity'], documentStatus: 'ERROR', updated: 'T9' }));
    const { result } = await mount();
    const reads = mockFetchReview.mock.calls.length;
    let done;
    await act(async () => { done = await result.current.markReviewed(); });
    expect(done).toBe(false);
    expect(mockFetchReview.mock.calls.length).toBe(reads);
    expect(result.current.save).toMatchObject({ status: 'error', errorKey: 'invoiceInboxSaveErrorNotValid' });
    expect(result.current.notice).toBeNull();
    expect(result.current.review.status).toBe('ERROR');
    expect(result.current.review.errorCode).toBe('MISSING_FIELDS');
    expect(result.current.review.updated).toBe('T9');
    expect(result.current.review.document.validation).toMatchObject({ valid: false, missing: ['line[0].quantity'] });
    expect(result.current.marking).toBe(false);
    // the next write carries the adopted token (not the stale T0)
    mockApply.mockResolvedValue(okOutcome(reviewOf('T10', [lineOf({ quantity: 3 })])));
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith(apiFetch, 'D1', 'T9', [{ op: 'setLine', index: 0, quantity: 3 }]));
  });

  it('markReviewed not_valid without the new token or the verdict keeps the previous ones and still reports the reason', async () => {
    mockMark.mockResolvedValue(failed('not_valid', { httpStatus: 422, missing: null, documentStatus: null, updated: null }));
    const { result } = await mount();
    await act(async () => { await result.current.markReviewed(); });
    expect(result.current.review.updated).toBe('T0');
    expect(result.current.review.status).toBe('ERROR');
    expect(result.current.review.document.validation.missing).toEqual([]);
    expect(result.current.save.errorKey).toBe('invoiceInboxSaveErrorNotValid');
  });

  it('markReviewed access_denied (code-less 403) shows the access reason, with no reload notice', async () => {
    mockMark.mockResolvedValue(failed('access_denied', { httpStatus: 403 }));
    const { result } = await mount();
    await act(async () => { await result.current.markReviewed(); });
    expect(result.current.save).toMatchObject({ status: 'error', errorKey: 'invoiceInboxSaveErrorAccess', code: 'access_denied' });
    expect(result.current.notice).toBeNull();
  });

  it('a write refused with unknown_tax rolls the tax pick back and shows its reason', async () => {
    mockApply.mockResolvedValue(failed('unknown_tax', { httpStatus: 422 }));
    const { result } = await mount('D1', reviewOf('T0', [lineOf({ tax: { state: 'resolved', id: 'T21', rate: 21, name: 'IVA 21%' } })]));
    act(() => { result.current.commit('line:0:tax', buildOp.setLine(0, { taxId: 'T10' }), { taxName: 'IVA 10%', taxRate: 10 }); });
    expect(result.current.review.document.lines[0].tax.id).toBe('T10');
    await waitFor(() => expect(result.current.save.status).toBe('error'));
    expect(result.current.save.errorKey).toBe('invoiceInboxSaveErrorUnknownTax');
    expect(result.current.review.document.lines[0].tax.id).toBe('T21');
    expect(result.current.review.document.lines[0].taxRate).toBe(21);
  });

  it('markReviewed not_reviewable reloads with a notice', async () => {
    mockMark.mockResolvedValue(failed('not_reviewable', { documentStatus: 'CONFIRMED' }));
    const { result } = await mount();
    await act(async () => { await result.current.markReviewed(); });
    expect(result.current.notice).toEqual({ key: 'invoiceInboxSaveErrorNotReviewable' });
  });

  it('markReviewed network error rolls back with the translated text', async () => {
    mockMark.mockRejectedValue(Object.assign(new Error('Sin red'), { name: 'NetworkError', code: 'NETWORK', reason: 'offline' }));
    const { result } = await mount();
    await act(async () => { await result.current.markReviewed(); });
    expect(result.current.save).toMatchObject({ status: 'error', errorText: 'Sin red' });
    expect(result.current.marking).toBe(false);
  });

  it('guards a reload while a write is open and releases it afterwards', async () => {
    const gate = deferred();
    mockApply.mockReturnValue(gate.promise);
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    expect(add.mock.calls.some(([name]) => name === 'beforeunload')).toBe(true);
    await act(async () => { gate.resolve(okOutcome(reviewOf('T1'))); });
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(remove.mock.calls.some(([name]) => name === 'beforeunload')).toBe(true);
    add.mockRestore(); remove.mockRestore();
  });

  it('retry re-reads the document and clears the error', async () => {
    mockApply.mockResolvedValue(failed('invalid_value', { httpStatus: 422 }));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    await waitFor(() => expect(result.current.save.status).toBe('error'));
    await act(async () => { await result.current.retry(); });
    expect(result.current.save.status).toBe('idle');
  });
});

// ── Confirm from the panel ────────────────────────────────────────────────────────────────────
describe('useInvoiceInboxReviewEditor — confirm', () => {
  const CONFIRMED = { id: 'D1', status: 'CONFIRMED', invoice: { id: 'I1', documentNo: 'FC1' }, createdProducts: 0 };

  it('flushes pending edits first, then confirms with the refreshed token and resolves the answer', async () => {
    mockApply.mockResolvedValue(okOutcome(reviewOf('T1', [lineOf({ quantity: 3 })])));
    mockConfirm.mockResolvedValue({ status: 'confirmed', result: CONFIRMED });
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    let answer;
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toEqual(CONFIRMED);
    expect(mockApply.mock.invocationCallOrder[0]).toBeLessThan(mockConfirm.mock.invocationCallOrder[0]);
    expect(mockConfirm).toHaveBeenCalledWith(apiFetch, 'D1', 'T1');
    expect(result.current.confirming).toBe(false);
    expect(result.current.refusal).toBeNull();
  });

  it('confirming is on while in flight and counts as saving', async () => {
    const gate = deferred();
    mockConfirm.mockReturnValue(gate.promise);
    const { result } = await mount();
    let run;
    act(() => { run = result.current.confirm(); });
    expect(result.current.confirming).toBe(true);
    expect(result.current.saving).toBe(true);
    await act(async () => { gate.resolve({ status: 'confirmed', result: CONFIRMED }); await run; });
    expect(result.current.confirming).toBe(false);
  });

  it('a double confirm sends ONE request', async () => {
    const gate = deferred();
    mockConfirm.mockReturnValue(gate.promise);
    const { result } = await mount();
    let first; let second;
    act(() => { first = result.current.confirm(); });
    await act(async () => { second = await result.current.confirm(); });
    expect(second).toBeNull();
    await act(async () => { gate.resolve({ status: 'confirmed', result: CONFIRMED }); await first; });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('an open save is awaited, its token adopted, and ONE confirm is sent (a second click during it sends nothing)', async () => {
    const saveGate = deferred();
    mockApply.mockReturnValue(saveGate.promise);
    mockConfirm.mockResolvedValue({ status: 'confirmed', result: CONFIRMED });
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    let first; let second;
    act(() => { first = result.current.confirm(); });
    await act(async () => { second = await result.current.confirm(); });
    expect(second).toBeNull();
    expect(mockConfirm).not.toHaveBeenCalled();
    await act(async () => { saveGate.resolve(okOutcome(reviewOf('T1', [lineOf({ quantity: 3 })]))); await first; });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(apiFetch, 'D1', 'T1');
    expect(mockApply.mock.invocationCallOrder[0]).toBeLessThan(mockConfirm.mock.invocationCallOrder[0]);
  });

  it('a save that left required fields pending sends no confirm and no refusal', async () => {
    mockApply.mockResolvedValue(okOutcome(reviewOf('T1', [lineOf()], { document: { header: { documentNo: 'F1' }, lines: [lineOf()], validation: { missing: ['vendor'] } } })));
    const { result } = await mount();
    act(() => { result.current.commit('header:documentNo', buildOp.setHeader({ documentNo: 'Z' })); });
    let answer;
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toBeNull();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(result.current.confirming).toBe(false);
  });

  it('a failed save sends no confirm and the save error stays', async () => {
    mockApply.mockResolvedValue(failed('invalid_value', { httpStatus: 422 }));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    await act(async () => { await result.current.confirm(); });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(result.current.save.status).toBe('error');
  });

  it('does not confirm when the flush failed', async () => {
    mockApply.mockResolvedValue(failed('invalid_value', { httpStatus: 422 }));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    let answer;
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toBeNull();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(result.current.confirming).toBe(false);
  });

  it.each([
    ['duplicate_invoice', 'invoiceInboxConfirmErrorDuplicate'],
    ['price_list_tax_included', 'invoiceInboxConfirmErrorPriceListTax'],
    ['missing_exchange_rate', 'invoiceInboxConfirmErrorExchangeRate'],
    ['vendor_address_missing', 'invoiceInboxConfirmErrorVendorAddress'],
    ['QUOTA_EXCEEDED', 'invoiceInboxConfirmErrorQuota'],
  ])('%s sets a refusal (full banner), does not reload and leaves no retry state', async (code, key) => {
    mockConfirm.mockResolvedValue(failed(code, { httpStatus: 422 }));
    const { result } = await mount();
    const reads = mockFetchReview.mock.calls.length;
    let answer;
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toBeNull();
    expect(result.current.refusal).toEqual({ code, key });
    expect(mockFetchReview.mock.calls.length).toBe(reads);
    expect(result.current.save.status).toBe('idle');
    expect(result.current.notice).toBeNull();
  });

  it('a refusal is cleared by the next edit and by dismissRefusal', async () => {
    mockConfirm.mockResolvedValue(failed('duplicate_invoice', { httpStatus: 409 }));
    mockApply.mockResolvedValue(okOutcome(reviewOf('T1')));
    const { result } = await mount();
    await act(async () => { await result.current.confirm(); });
    expect(result.current.refusal).not.toBeNull();
    act(() => { result.current.dismissRefusal(); });
    expect(result.current.refusal).toBeNull();
    await act(async () => { await result.current.confirm(); });
    expect(result.current.refusal).not.toBeNull();
    act(() => { result.current.commit('header:documentNo', buildOp.setHeader({ documentNo: 'Z' })); });
    expect(result.current.refusal).toBeNull();
  });

  it('a refusal is cleared by the next confirm', async () => {
    mockConfirm.mockResolvedValueOnce(failed('duplicate_invoice', { httpStatus: 409 })).mockResolvedValueOnce({ status: 'confirmed', result: CONFIRMED });
    const { result } = await mount();
    await act(async () => { await result.current.confirm(); });
    expect(result.current.refusal).not.toBeNull();
    await act(async () => { await result.current.confirm(); });
    expect(result.current.refusal).toBeNull();
  });

  it('a refusal is cleared when the open document changes', async () => {
    mockConfirm.mockResolvedValue(failed('duplicate_invoice', { httpStatus: 409 }));
    const { result, rerender } = await mount();
    await act(async () => { await result.current.confirm(); });
    expect(result.current.refusal).not.toBeNull();
    mockFetchReview.mockResolvedValue(okOutcome(reviewOf('T5', [lineOf()], { id: 'D2' })));
    rerender({ docId: 'D2' });
    await waitFor(() => expect(result.current.refusal).toBeNull());
  });

  it('confirm_failed re-reads the document (the stored ERROR and its detail), adopts its token, shows no refusal', async () => {
    mockConfirm.mockResolvedValueOnce(failed('confirm_failed', { httpStatus: 500, detail: 'boom' }));
    const { result } = await mount();
    mockFetchReview.mockResolvedValue(okOutcome(reviewOf('T7', [lineOf()], { status: 'ERROR', errorCode: 'CONFIRM_FAILED', errorDetail: 'boom' })));
    await act(async () => { await result.current.confirm(); });
    expect(result.current.refusal).toBeNull();
    expect(result.current.review).toMatchObject({ status: 'ERROR', errorCode: 'CONFIRM_FAILED', errorDetail: 'boom' });
    mockConfirm.mockResolvedValueOnce({ status: 'confirmed', result: CONFIRMED });
    await act(async () => { await result.current.confirm(); });
    expect(mockConfirm).toHaveBeenLastCalledWith(apiFetch, 'D1', 'T7');
  });

  it.each([
    ['stale_document', { }, 'invoiceInboxSaveErrorStale'],
    ['not_confirmable', { documentStatus: 'CONFIRMED' }, 'invoiceInboxSaveErrorNotConfirmable'],
  ])('%s reloads the document with a notice and no refusal', async (code, extra, key) => {
    mockConfirm.mockResolvedValueOnce(failed(code, extra));
    const { result } = await mount();
    const reads = mockFetchReview.mock.calls.length;
    await act(async () => { await result.current.confirm(); });
    expect(result.current.notice).toEqual({ key });
    expect(mockFetchReview.mock.calls.length).toBe(reads + 1);
    expect(result.current.refusal).toBeNull();
  });

  it('not_valid adopts the recomputed missing and the new token without a reload', async () => {
    mockConfirm.mockResolvedValue(failed('not_valid', { httpStatus: 422, missing: ['exchangeRate'], documentStatus: 'ERROR', updated: 'T9' }));
    const { result } = await mount();
    const reads = mockFetchReview.mock.calls.length;
    await act(async () => { await result.current.confirm(); });
    expect(mockFetchReview.mock.calls.length).toBe(reads);
    expect(result.current.review.updated).toBe('T9');
    expect(result.current.review.document.validation.missing).toEqual(['exchangeRate']);
    expect(result.current.save).toMatchObject({ status: 'error', errorKey: 'invoiceInboxSaveErrorNotValid' });
  });

  it('access_denied sets a refusal with the access-denied reason key', async () => {
    mockConfirm.mockResolvedValue(failed('access_denied', { httpStatus: 403 }));
    const { result } = await mount();
    await act(async () => { await result.current.confirm(); });
    expect(result.current.refusal).toEqual({ code: 'access_denied', key: 'invoiceInboxSaveErrorAccess' });
  });

  it('a network error rolls back with the translated text and resolves null', async () => {
    mockConfirm.mockRejectedValue(Object.assign(new Error('Sin red'), { name: 'NetworkError', code: 'NETWORK', reason: 'offline' }));
    const { result } = await mount();
    let answer;
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toBeNull();
    expect(result.current.save).toMatchObject({ status: 'error', errorText: 'Sin red' });
    expect(result.current.confirming).toBe(false);
  });

  it('a confirmed invoice is handed back even if the open document changed meanwhile', async () => {
    const gate = deferred();
    mockConfirm.mockReturnValue(gate.promise);
    const { result, rerender } = await mount();
    let run;
    act(() => { run = result.current.confirm(); });
    // The request is on the wire (the flush before it is asynchronous) when the document changes.
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    mockFetchReview.mockResolvedValue(okOutcome(reviewOf('T5', [lineOf()], { id: 'D2' })));
    rerender({ docId: 'D2' });
    let answer;
    await act(async () => { gate.resolve({ status: 'confirmed', result: CONFIRMED }); answer = await run; });
    expect(answer).toEqual(CONFIRMED);
  });
});

// ── Mark as reviewed: same ordering contract as confirm ───────────────────────────────────────
describe('useInvoiceInboxReviewEditor — markReviewed ordering', () => {
  it('waits for the open save, adopts its token and sends ONE mark-reviewed', async () => {
    const saveGate = deferred();
    mockApply.mockReturnValue(saveGate.promise);
    mockMark.mockResolvedValue(okOutcome(reviewOf('T2', [lineOf({ quantity: 3 })], { status: 'READY', reviewed: true })));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    let run;
    act(() => { run = result.current.markReviewed(); });
    expect(mockMark).not.toHaveBeenCalled();
    await act(async () => { saveGate.resolve(okOutcome(reviewOf('T1', [lineOf({ quantity: 3 })]))); await run; });
    expect(mockMark).toHaveBeenCalledTimes(1);
    expect(mockMark).toHaveBeenCalledWith(apiFetch, 'D1', 'T1');
  });

  it('a failed save sends no mark-reviewed and the save error stays', async () => {
    mockApply.mockResolvedValue(failed('invalid_value', { httpStatus: 422 }));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    let ok;
    await act(async () => { ok = await result.current.markReviewed(); });
    expect(ok).toBe(false);
    expect(mockMark).not.toHaveBeenCalled();
    expect(result.current.save.status).toBe('error');
  });
});

// ── A reload code is handled by the re-read: the NEXT click must send again, with the fresh token ──
describe('useInvoiceInboxReviewEditor — retry after a refusal', () => {
  const CONFIRMED = { id: 'D1', status: 'CONFIRMED', invoice: { id: 'I1', documentNo: 'FC1' }, createdProducts: 0 };
  const RELOAD = ['stale_document', 'not_confirmable', 'processing', 'not_editable'];

  it.each(RELOAD)('a second confirm after %s sends again with the re-read token', async (code) => {
    mockConfirm.mockResolvedValueOnce(failed(code)).mockResolvedValueOnce({ status: 'confirmed', result: CONFIRMED });
    const { result } = await mount();
    mockFetchReview.mockResolvedValue(okOutcome(reviewOf('T7')));
    await act(async () => { expect(await result.current.confirm()).toBeNull(); });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    let answer;
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toEqual(CONFIRMED);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenLastCalledWith(apiFetch, 'D1', 'T7');
  });

  it.each(['stale_document', 'not_reviewable'])('a second mark-reviewed after %s sends again with the re-read token', async (code) => {
    mockMark.mockResolvedValueOnce(failed(code)).mockResolvedValueOnce(okOutcome(reviewOf('T8', [lineOf()], { status: 'READY', reviewed: true })));
    const { result } = await mount();
    mockFetchReview.mockResolvedValue(okOutcome(reviewOf('T7')));
    await act(async () => { expect(await result.current.markReviewed()).toBe(false); });
    let ok;
    await act(async () => { ok = await result.current.markReviewed(); });
    expect(ok).toBe(true);
    expect(mockMark).toHaveBeenCalledTimes(2);
    expect(mockMark).toHaveBeenLastCalledWith(apiFetch, 'D1', 'T7');
  });

  it('a failed re-read keeps the block: no confirm is sent until the document is read again', async () => {
    mockConfirm.mockResolvedValueOnce(failed('stale_document'));
    const { result } = await mount();
    mockFetchReview.mockResolvedValue({ status: 'failed', code: 'network' });
    await act(async () => { await result.current.confirm(); });
    let answer;
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toBeNull();
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('a second confirm after duplicate_invoice sends again', async () => {
    mockConfirm.mockResolvedValueOnce(failed('duplicate_invoice', { httpStatus: 422 })).mockResolvedValueOnce({ status: 'confirmed', result: CONFIRMED });
    const { result } = await mount();
    await act(async () => { await result.current.confirm(); });
    let answer;
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toEqual(CONFIRMED);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  it('a second confirm after a network error sends again', async () => {
    mockConfirm.mockRejectedValueOnce(Object.assign(new Error('Sin red'), { name: 'NetworkError', code: 'NETWORK', reason: 'offline' }))
      .mockResolvedValueOnce({ status: 'confirmed', result: CONFIRMED });
    const { result } = await mount();
    await act(async () => { await result.current.confirm(); });
    let answer;
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toEqual(CONFIRMED);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  it('a second confirm after confirm_failed sends again', async () => {
    mockConfirm.mockResolvedValueOnce(failed('confirm_failed', { httpStatus: 500 })).mockResolvedValueOnce({ status: 'confirmed', result: CONFIRMED });
    const { result } = await mount();
    await act(async () => { await result.current.confirm(); });
    await act(async () => { await result.current.confirm(); });
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  it('a second confirm after not_valid sends again', async () => {
    mockConfirm.mockResolvedValueOnce(failed('not_valid', { httpStatus: 422, missing: [], documentStatus: 'PENDING_REVIEW', updated: 'T9' }))
      .mockResolvedValueOnce({ status: 'confirmed', result: CONFIRMED });
    const { result } = await mount();
    await act(async () => { await result.current.confirm(); });
    await act(async () => { await result.current.confirm(); });
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenLastCalledWith(apiFetch, 'D1', 'T9');
  });

  it('a failed SAVE still blocks the confirm (the block is not cleared by a later click)', async () => {
    mockApply.mockResolvedValue(failed('invalid_value', { httpStatus: 422 }));
    const { result } = await mount();
    act(() => { result.current.commit('line:0:quantity', buildOp.setLine(0, { quantity: 3 })); });
    await act(async () => { await result.current.confirm(); });
    await act(async () => { await result.current.confirm(); });
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});

// ── Mark-reviewed and confirm are mutually exclusive, and `marking` is on from the first instant ──
describe('useInvoiceInboxReviewEditor — one request on the document at a time', () => {
  const CONFIRMED = { id: 'D1', status: 'CONFIRMED', invoice: { id: 'I1', documentNo: 'FC1' }, createdProducts: 0 };

  it('a double click on mark-reviewed sends ONE request; marking is true before flush resolves', async () => {
    const gate = deferred();
    mockMark.mockReturnValue(gate.promise);
    const { result } = await mount();
    let first; let second;
    act(() => { first = result.current.markReviewed(); second = result.current.markReviewed(); });
    // Synchronously after the click, before any await resolved.
    expect(result.current.marking).toBe(true);
    expect(result.current.saving).toBe(true);
    expect(await second).toBe(false);
    await waitFor(() => expect(mockMark).toHaveBeenCalledTimes(1));
    await act(async () => { gate.resolve(okOutcome(reviewOf('T2', [lineOf()], { status: 'READY', reviewed: true }))); await first; });
    expect(mockMark).toHaveBeenCalledTimes(1);
    expect(result.current.marking).toBe(false);
  });

  it('a confirm click while mark-reviewed runs is ignored', async () => {
    const gate = deferred();
    mockMark.mockReturnValue(gate.promise);
    const { result } = await mount();
    let run; let answer;
    act(() => { run = result.current.markReviewed(); });
    await act(async () => { answer = await result.current.confirm(); });
    expect(answer).toBeNull();
    expect(mockConfirm).not.toHaveBeenCalled();
    await act(async () => { gate.resolve(okOutcome(reviewOf('T2', [lineOf()], { status: 'READY', reviewed: true }))); await run; });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('a mark-reviewed click while confirm runs is ignored', async () => {
    const gate = deferred();
    mockConfirm.mockReturnValue(gate.promise);
    const { result } = await mount();
    let run; let ok;
    act(() => { run = result.current.confirm(); });
    await act(async () => { ok = await result.current.markReviewed(); });
    expect(ok).toBe(false);
    expect(mockMark).not.toHaveBeenCalled();
    await act(async () => { gate.resolve({ status: 'confirmed', result: CONFIRMED }); await run; });
    expect(mockMark).not.toHaveBeenCalled();
  });

  it('marking is released after a refused mark-reviewed, so the next click may send', async () => {
    mockMark.mockResolvedValueOnce(failed('access_denied', { httpStatus: 403 }))
      .mockResolvedValueOnce(okOutcome(reviewOf('T2', [lineOf()], { status: 'READY', reviewed: true })));
    const { result } = await mount();
    await act(async () => { await result.current.markReviewed(); });
    expect(result.current.marking).toBe(false);
    await act(async () => { await result.current.markReviewed(); });
    expect(mockMark).toHaveBeenCalledTimes(2);
  });
});
