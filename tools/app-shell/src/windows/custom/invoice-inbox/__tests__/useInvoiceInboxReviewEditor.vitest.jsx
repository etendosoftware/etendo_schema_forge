// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReviewEditor.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReview.js
// New file justification: no test covers the S2 editor hook; useInvoiceInboxReview.vitest.jsx is
// the read-only loader hook (a different unit) and the drawer tests only see it through the DOM.
import { renderHook, act, waitFor } from '@testing-library/react';

const mockFetchReview = vi.fn();
const mockApply = vi.fn();
const mockMark = vi.fn();
vi.mock('../invoiceInboxApi.js', () => ({
  fetchReview: (...a) => mockFetchReview(...a),
  applyOperations: (...a) => mockApply(...a),
  markReviewed: (...a) => mockMark(...a),
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
  mockFetchReview.mockReset(); mockApply.mockReset(); mockMark.mockReset();
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
