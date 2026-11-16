// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReview.js
// New file justification: no existing test covers the review read hook; useInvoiceInboxList.vitest.jsx
// is about the paged list (a different hook) and invoiceInboxApi.vitest.js about the request shape.
import { renderHook, act, waitFor } from '@testing-library/react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';

const mockFetchReview = vi.fn();
vi.mock('../invoiceInboxApi.js', () => ({ fetchReview: (...args) => mockFetchReview(...args) }));

import { useInvoiceInboxReview } from '../useInvoiceInboxReview.js';

const apiFetch = vi.fn();
const ok = (id) => ({ status: 'ok', review: { id, status: 'READY' } });

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function networkError(message) {
  return Object.assign(new Error(message), { name: 'NetworkError', code: 'NETWORK', reason: 'offline' });
}

beforeEach(() => { mockFetchReview.mockReset(); });

describe('useInvoiceInboxReview', () => {
  it('stays idle without an id and makes no request', () => {
    const { result } = renderHook(() => useInvoiceInboxReview(apiFetch, null));
    expect(result.current).toMatchObject({ review: null, loading: false, errorKey: null, errorText: null });
    expect(mockFetchReview).not.toHaveBeenCalled();
  });

  it('loads the document for an id', async () => {
    mockFetchReview.mockResolvedValue(ok('D1'));
    const { result } = renderHook(() => useInvoiceInboxReview(apiFetch, 'D1'));
    expect(result.current.loading).toBe(true);
    expect(result.current.review).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.review).toEqual({ id: 'D1', status: 'READY' });
    expect(mockFetchReview).toHaveBeenCalledWith(apiFetch, 'D1', expect.any(AbortSignal));
  });

  it.each([
    ['processing', 'invoiceInboxReviewErrorProcessing'],
    ['not_found', 'invoiceInboxReviewErrorNotFound'],
    ['feature_disabled', 'invoiceInboxReviewErrorFeatureDisabled'],
    ['org_not_allowed', 'invoiceInboxReviewErrorOrg'],
    ['whatever', 'invoiceInboxReviewErrorGeneric'],
    [null, 'invoiceInboxReviewErrorGeneric'],
  ])('a failed answer with code %s exposes the key %s and no review', async (code, key) => {
    mockFetchReview.mockResolvedValue({ status: 'failed', code, httpStatus: 500 });
    const { result } = renderHook(() => useInvoiceInboxReview(apiFetch, 'D1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ review: null, errorKey: key, errorText: null });
  });

  it('a network error exposes its already translated message, not a key', async () => {
    const err = networkError('No se pudo completar la acción.');
    expect(isNetworkError(err)).toBe(true);
    mockFetchReview.mockRejectedValue(err);
    const { result } = renderHook(() => useInvoiceInboxReview(apiFetch, 'D1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ review: null, errorKey: null, errorText: 'No se pudo completar la acción.' });
  });

  it('any other rejection maps to the generic key', async () => {
    mockFetchReview.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useInvoiceInboxReview(apiFetch, 'D1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ errorKey: 'invoiceInboxReviewErrorGeneric', errorText: null });
  });

  it('reload re-reads the document and clears the error', async () => {
    mockFetchReview.mockResolvedValueOnce({ status: 'failed', code: 'processing', httpStatus: 409 });
    mockFetchReview.mockResolvedValueOnce(ok('D1'));
    const { result } = renderHook(() => useInvoiceInboxReview(apiFetch, 'D1'));
    await waitFor(() => expect(result.current.errorKey).toBe('invoiceInboxReviewErrorProcessing'));
    await act(async () => { result.current.reload(); });
    await waitFor(() => expect(result.current.review).toEqual({ id: 'D1', status: 'READY' }));
    expect(result.current.errorKey).toBeNull();
    expect(mockFetchReview).toHaveBeenCalledTimes(2);
  });

  it('race: a late answer of the previous document never overwrites the current one', async () => {
    const first = deferred();
    const second = deferred();
    mockFetchReview.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ id }) => useInvoiceInboxReview(apiFetch, id), { initialProps: { id: 'A' } });
    rerender({ id: 'B' });
    // The first request was aborted by the id change.
    expect(mockFetchReview.mock.calls[0][2].aborted).toBe(true);
    await act(async () => { second.resolve(ok('B')); });
    await waitFor(() => expect(result.current.review?.id).toBe('B'));
    await act(async () => { first.resolve(ok('A')); });
    expect(result.current.review.id).toBe('B');
  });

  it('race: a late FAILURE of the previous document does not replace the current review', async () => {
    const first = deferred();
    mockFetchReview.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok('B'));
    const { result, rerender } = renderHook(({ id }) => useInvoiceInboxReview(apiFetch, id), { initialProps: { id: 'A' } });
    rerender({ id: 'B' });
    await waitFor(() => expect(result.current.review?.id).toBe('B'));
    await act(async () => { first.reject(new Error('late')); });
    expect(result.current.review.id).toBe('B');
    expect(result.current.errorKey).toBeNull();
  });

  it('the previous document is never shown under the new id (cleared in the same render)', async () => {
    mockFetchReview.mockResolvedValueOnce(ok('A')).mockReturnValueOnce(deferred().promise);
    const { result, rerender } = renderHook(({ id }) => useInvoiceInboxReview(apiFetch, id), { initialProps: { id: 'A' } });
    await waitFor(() => expect(result.current.review?.id).toBe('A'));
    rerender({ id: 'B' });
    expect(result.current.review).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('closing (id back to null) aborts the in-flight read and ignores its answer', async () => {
    const pending = deferred();
    mockFetchReview.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ id }) => useInvoiceInboxReview(apiFetch, id), { initialProps: { id: 'A' } });
    rerender({ id: null });
    expect(mockFetchReview.mock.calls[0][2].aborted).toBe(true);
    await act(async () => { pending.resolve(ok('A')); });
    expect(result.current).toMatchObject({ review: null, loading: false });
  });

  it('an AbortError is swallowed (no error shown)', async () => {
    mockFetchReview.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const { result } = renderHook(() => useInvoiceInboxReview(apiFetch, 'D1'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.errorKey).toBeNull();
    expect(result.current.errorText).toBeNull();
  });

  it('aborts the read on unmount', () => {
    mockFetchReview.mockReturnValue(deferred().promise);
    const { unmount } = renderHook(() => useInvoiceInboxReview(apiFetch, 'D1'));
    unmount();
    expect(mockFetchReview.mock.calls[0][2].aborted).toBe(true);
  });
});
