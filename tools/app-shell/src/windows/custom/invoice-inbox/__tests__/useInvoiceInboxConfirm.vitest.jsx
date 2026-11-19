// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxConfirm.js
// New file justification: useInvoiceInboxConfirm.js is a new module with no test; the existing hook tests
// (useInvoiceInboxDiscard.vitest.jsx, useInvoiceInboxUpload.vitest.jsx) are about other hooks.
import { renderHook, act, waitFor } from '@testing-library/react';

const mockConfirm = vi.fn();
vi.mock('../invoiceInboxApi.js', () => ({
  confirmInboxDocument: (...a) => mockConfirm(...a),
}));

import { confirmRow, runConfirmQueue, useInvoiceInboxConfirm } from '../useInvoiceInboxConfirm.js';

const apiFetch = () => {};
const row = (id, status = 'READY', extra = {}) => ({ id, fileName: `${id}.pdf`, status, ...extra });
const OK = (documentNo, extra = {}) => ({ status: 'confirmed', result: { invoice: { id: `inv-${documentNo}`, documentNo }, createdProducts: 0, ...extra } });
const fail = (code, httpStatus = 409, extra = {}) => ({ status: 'failed', code, httpStatus, ...extra });
const networkErr = () => Object.assign(new Error('Sin conexión'), { name: 'NetworkError', code: 'NETWORK' });

/** A promise the test resolves by hand, to prove the queue waits for it. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => { mockConfirm.mockReset(); });

describe('confirmRow', () => {
  it('maps a confirmed answer to an entry', async () => {
    mockConfirm.mockResolvedValue(OK('FC1', { createdProducts: '2', createdVendor: true, alreadyConfirmed: false, totalMismatch: 'Y' }));
    expect(await confirmRow(apiFetch, row('a'))).toEqual({
      ok: true,
      entry: { id: 'a', documentNo: 'FC1', invoiceId: 'inv-FC1', createdProducts: 2, createdVendor: true, alreadyConfirmed: false, totalMismatch: true },
    });
    expect(mockConfirm).toHaveBeenCalledWith(apiFetch, 'a');
  });
  it('an answer with no invoice still confirms with null numbers', async () => {
    mockConfirm.mockResolvedValue({ status: 'confirmed', result: {} });
    const out = await confirmRow(apiFetch, row('a'));
    expect(out.entry).toMatchObject({ documentNo: null, invoiceId: null, createdProducts: 0, totalMismatch: false });
  });
  it.each([
    ['org_not_allowed', 409, false],
    ['price_list_tax_included', 422, false],
    ['duplicate_invoice', 409, false],
    ['missing_exchange_rate', 422, false],
    ['vendor_address_missing', 422, false],
    ['not_valid', 422, false],
    ['confirm_failed', 500, false],
    ['feature_disabled', 403, true],
    ['QUOTA_EXCEEDED', 402, true],
  ])('code %s %s stops=%s', async (code, httpStatus, stops) => {
    mockConfirm.mockResolvedValue(fail(code, httpStatus, { detail: 'why' }));
    const out = await confirmRow(apiFetch, row('a'));
    expect(out).toMatchObject({ ok: false, stops, failure: { id: 'a', fileName: 'a.pdf', code, detail: 'why' } });
  });
  it('the identifier of a confirm_failed travels with the failure', async () => {
    mockConfirm.mockResolvedValue(fail('confirm_failed', 422, { detail: 'why', detailInfo: { code: 'refused', params: { message: 'why' } } }));
    expect(await confirmRow(apiFetch, row('a'))).toMatchObject({ failure: { detailInfo: { code: 'refused', params: { message: 'why' } } } });
  });
  it('a code-less 403 stops as access_denied; a 404 is not_found and does not stop', async () => {
    mockConfirm.mockResolvedValue({ status: 'failed', code: null, httpStatus: 403 });
    expect(await confirmRow(apiFetch, row('a'))).toMatchObject({ stops: true, failure: { code: 'access_denied', reasonKey: 'invoiceInboxConfirmReasonAccess' } });
    mockConfirm.mockResolvedValue({ status: 'failed', code: null, httpStatus: 404 });
    expect(await confirmRow(apiFetch, row('a'))).toMatchObject({ stops: false, failure: { code: 'not_found' } });
  });
  it('invalid_request and unknown codes use the generic reason', async () => {
    mockConfirm.mockResolvedValue(fail('invalid_request', 400));
    expect((await confirmRow(apiFetch, row('a'))).failure.reasonKey).toBe('invoiceInboxConfirmReasonGeneric');
  });
  it('a network error stops with its translated text; any other throw does not stop', async () => {
    mockConfirm.mockRejectedValue(networkErr());
    expect(await confirmRow(apiFetch, row('a'))).toMatchObject({ ok: false, stops: true, failure: { code: 'network', reasonText: 'Sin conexión' } });
    mockConfirm.mockRejectedValue(new Error('boom'));
    expect(await confirmRow(apiFetch, row('a'))).toMatchObject({ ok: false, stops: false, failure: { code: null, reasonKey: 'invoiceInboxConfirmReasonGeneric' } });
  });
});

describe('runConfirmQueue', () => {
  it('is strictly sequential: the second request is not sent before the first resolves', async () => {
    const first = deferred();
    mockConfirm.mockImplementationOnce(() => first.promise).mockResolvedValue(OK('FC2'));
    const run = runConfirmQueue(apiFetch, [row('a'), row('b')]);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    first.resolve(OK('FC1'));
    const result = await run;
    expect(mockConfirm.mock.calls.map((c) => c[1])).toEqual(['a', 'b']);
    expect(result.ok.map((e) => e.documentNo)).toEqual(['FC1', 'FC2']);
  });
  it('a per-document refusal does not stop the run: [ok, org_not_allowed, ok] gives 2 ok, 1 failed', async () => {
    mockConfirm.mockResolvedValueOnce(OK('FC1')).mockResolvedValueOnce(fail('org_not_allowed', 403)).mockResolvedValueOnce(OK('FC2'));
    const result = await runConfirmQueue(apiFetch, [row('a'), row('b'), row('c')]);
    expect(result).toMatchObject({ total: 3, stopped: null, notSent: [] });
    expect(result.ok.map((e) => e.id)).toEqual(['a', 'c']);
    expect(result.failed.map((f) => f.id)).toEqual(['b']);
  });
  it.each(['QUOTA_EXCEEDED', 'feature_disabled', 'access_denied'])('%s stops the run and leaves the rest as notSent', async (code) => {
    mockConfirm.mockResolvedValueOnce(OK('FC1')).mockResolvedValueOnce(fail(code, 403)).mockResolvedValue(OK('FC3'));
    const result = await runConfirmQueue(apiFetch, [row('a'), row('b'), row('c')]);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(result.stopped).toMatchObject({ id: 'b', code });
    expect(result.notSent).toEqual(['c']);
    expect(result.ok.map((e) => e.id)).toEqual(['a']);
  });
  it.each(['price_list_tax_included', 'duplicate_invoice', 'missing_exchange_rate', 'vendor_address_missing', 'not_valid', 'confirm_failed'])('%s does NOT stop the run', async (code) => {
    mockConfirm.mockResolvedValueOnce(fail(code, 422)).mockResolvedValueOnce(OK('FC2'));
    const result = await runConfirmQueue(apiFetch, [row('a'), row('b')]);
    expect(result.stopped).toBeNull();
    expect(result.ok).toHaveLength(1);
    expect(result.notSent).toEqual([]);
  });
  it('a network error stops the run with its text', async () => {
    mockConfirm.mockRejectedValueOnce(networkErr());
    const result = await runConfirmQueue(apiFetch, [row('a'), row('b')]);
    expect(result.stopped).toMatchObject({ code: 'network', reasonText: 'Sin conexión' });
    expect(result.notSent).toEqual(['b']);
  });
  it('isActive false stops sending: the rest is notSent', async () => {
    mockConfirm.mockResolvedValue(OK('FC1'));
    let active = true;
    mockConfirm.mockImplementation(async () => { active = false; return OK('FC1'); });
    const result = await runConfirmQueue(apiFetch, [row('a'), row('b'), row('c')], { isActive: () => active });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(result.notSent).toEqual(['b', 'c']);
  });
  it('reports progress before the first request and after each one', async () => {
    mockConfirm.mockResolvedValueOnce(OK('FC1')).mockResolvedValueOnce(fail('not_valid', 422));
    const seen = [];
    await runConfirmQueue(apiFetch, [row('a'), row('b')], { onProgress: (p) => seen.push(p) });
    expect(seen).toEqual([{ done: 0, total: 2 }, { done: 1, total: 2 }, { done: 2, total: 2 }]);
  });
  it('an empty queue sends nothing', async () => {
    const result = await runConfirmQueue(apiFetch, []);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(result).toMatchObject({ total: 0, ok: [], failed: [], notSent: [] });
  });
});

describe('useInvoiceInboxConfirm', () => {
  it('only sends confirmable rows, in order', async () => {
    mockConfirm.mockResolvedValue(OK('FC'));
    const { result } = renderHook(() => useInvoiceInboxConfirm(apiFetch));
    let run;
    await act(async () => {
      run = await result.current.confirm([
        row('a'), row('b', 'CONFIRMED'), row('c', 'ERROR', { errorCode: 'UNREADABLE' }), row('d', 'ERROR', { errorCode: 'CONFIRM_FAILED' }), row('e', 'PROCESSING'), row('f', 'PENDING_REVIEW'),
      ]);
    });
    expect(mockConfirm.mock.calls.map((c) => c[1])).toEqual(['a', 'd', 'f']);
    expect(run.total).toBe(3);
  });
  it('exposes running and progress while in flight and clears them after', async () => {
    const gate = deferred();
    mockConfirm.mockImplementationOnce(() => gate.promise).mockResolvedValue(OK('FC2'));
    const { result } = renderHook(() => useInvoiceInboxConfirm(apiFetch));
    expect(result.current.running).toBe(false);
    let run;
    act(() => { run = result.current.confirm([row('a'), row('b')]); });
    await waitFor(() => expect(result.current.running).toBe(true));
    expect(result.current.progress).toEqual({ done: 0, total: 2 });
    await act(async () => { gate.resolve(OK('FC1')); await run; });
    expect(result.current.running).toBe(false);
    expect(result.current.progress).toBeNull();
  });
  it('a second confirm while one runs returns null and sends nothing more', async () => {
    const gate = deferred();
    mockConfirm.mockImplementationOnce(() => gate.promise);
    const { result } = renderHook(() => useInvoiceInboxConfirm(apiFetch));
    let first;
    act(() => { first = result.current.confirm([row('a')]); });
    let second;
    await act(async () => { second = await result.current.confirm([row('a')]); });
    expect(second).toBeNull();
    await act(async () => { gate.resolve(OK('FC1')); await first; });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });
  it('can run again after one finished', async () => {
    mockConfirm.mockResolvedValue(OK('FC'));
    const { result } = renderHook(() => useInvoiceInboxConfirm(apiFetch));
    await act(async () => { await result.current.confirm([row('a')]); });
    let again;
    await act(async () => { again = await result.current.confirm([row('b')]); });
    expect(again).not.toBeNull();
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });
  it('after unmount it stops sending and still resolves, without touching state', async () => {
    const gate = deferred();
    mockConfirm.mockImplementationOnce(() => gate.promise).mockResolvedValue(OK('FC2'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useInvoiceInboxConfirm(apiFetch));
    let run;
    act(() => { run = result.current.confirm([row('a'), row('b'), row('c')]); });
    unmount();
    gate.resolve(OK('FC1'));
    const out = await run;
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(out.ok).toHaveLength(1);
    expect(out.notSent).toEqual(['b', 'c']);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
