// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxDiscard.js
// New file justification: no existing test covers the discard hook (useInvoiceInboxUpload.vitest.jsx is the upload hook).
import { renderHook, act, waitFor } from '@testing-library/react';

const mockDiscard = vi.fn();
vi.mock('../invoiceInboxApi.js', () => ({
  discardInboxDocument: (...a) => mockDiscard(...a),
}));

import { discardRow, discardToast, runDiscardQueue, useInvoiceInboxDiscard, DISCARD_CONCURRENCY } from '../useInvoiceInboxDiscard.js';

const apiFetch = () => {};
const rowsOf = (n, status = 'READY') => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, fileName: `f${i}.pdf`, status }));
const OK = { status: 'discarded' };
const fail = (code, httpStatus = 409) => ({ status: 'failed', code, httpStatus });
const networkErr = () => Object.assign(new Error('Sin conexión'), { code: 'NETWORK' });

beforeEach(() => { mockDiscard.mockReset(); });

describe('discardRow', () => {
  it('ok on a discarded outcome', async () => {
    mockDiscard.mockResolvedValue(OK);
    expect(await discardRow(apiFetch, rowsOf(1)[0])).toEqual({ ok: true });
  });
  it('409 not_discardable fails the row without stopping', async () => {
    mockDiscard.mockResolvedValue(fail('not_discardable'));
    const out = await discardRow(apiFetch, rowsOf(1)[0]);
    expect(out).toMatchObject({ ok: false, stops: false, failure: { id: 'r0', code: 'not_discardable', reasonKey: 'invoiceInboxDiscardReasonNotDiscardable' } });
  });
  it('org_not_allowed fails only its row', async () => {
    mockDiscard.mockResolvedValue(fail('org_not_allowed', 403));
    expect((await discardRow(apiFetch, rowsOf(1)[0])).stops).toBe(false);
  });
  it.each([['feature_disabled', 403], [null, 403]])('code %s with %s stops the batch', async (code, st) => {
    mockDiscard.mockResolvedValue({ status: 'failed', code, httpStatus: st });
    const out = await discardRow(apiFetch, rowsOf(1)[0]);
    expect(out.stops).toBe(true);
    expect(out.failure.code).toBe(code ?? 'access_denied');
  });
  it('404 maps to not_found and does not stop', async () => {
    mockDiscard.mockResolvedValue({ status: 'failed', code: null, httpStatus: 404 });
    const out = await discardRow(apiFetch, rowsOf(1)[0]);
    expect(out.failure.code).toBe('not_found');
    expect(out.stops).toBe(false);
  });
  it('a NetworkError stops and carries its translated text; never throws', async () => {
    mockDiscard.mockRejectedValue(networkErr());
    const out = await discardRow(apiFetch, rowsOf(1)[0]);
    expect(out).toMatchObject({ ok: false, stops: true, failure: { code: 'network', reasonText: 'Sin conexión' } });
  });
  it('an unexpected error fails the row with the generic reason, no stop', async () => {
    mockDiscard.mockRejectedValue(new Error('boom'));
    const out = await discardRow(apiFetch, rowsOf(1)[0]);
    expect(out).toMatchObject({ ok: false, stops: false, failure: { code: null, reasonKey: 'invoiceInboxDiscardReasonGeneric' } });
  });
});

describe('runDiscardQueue', () => {
  it('never has more than 3 requests in flight and sends every row', async () => {
    let inFlight = 0; let peak = 0;
    mockDiscard.mockImplementation(async () => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1; return OK;
    });
    const res = await runDiscardQueue(apiFetch, rowsOf(10));
    expect(DISCARD_CONCURRENCY).toBe(3);
    expect(peak).toBe(3);
    expect(res.ok).toHaveLength(10);
    expect(res).toMatchObject({ total: 10, failed: [], stopped: null, notSent: [] });
  });

  it('a partial batch (409 on one row) reports ok and failed', async () => {
    mockDiscard.mockImplementation(async (_f, id) => (id === 'r1' ? fail('not_discardable') : OK));
    const res = await runDiscardQueue(apiFetch, rowsOf(3));
    expect(res.ok.sort()).toEqual(['r0', 'r2']);
    expect(res.failed.map((f) => f.id)).toEqual(['r1']);
    expect(res.stopped).toBeNull();
  });

  it('org_not_allowed on one row does not stop the others', async () => {
    mockDiscard.mockImplementation(async (_f, id) => (id === 'r0' ? fail('org_not_allowed', 403) : OK));
    const res = await runDiscardQueue(apiFetch, rowsOf(6));
    expect(res.ok).toHaveLength(5);
    expect(mockDiscard).toHaveBeenCalledTimes(6);
  });

  it.each([
    ['feature_disabled', fail('feature_disabled', 403)],
    ['code-less 403', { status: 'failed', code: null, httpStatus: 403 }],
  ])('%s stops the batch: rows not yet sent are notSent', async (_n, outcome) => {
    mockDiscard.mockResolvedValue(outcome);
    const res = await runDiscardQueue(apiFetch, rowsOf(10));
    expect(mockDiscard).toHaveBeenCalledTimes(3);
    expect(res.stopped).not.toBeNull();
    expect(res.notSent).toHaveLength(7);
    expect(res.ok).toEqual([]);
  });

  it('a NetworkError stops the batch', async () => {
    mockDiscard.mockRejectedValue(networkErr());
    const res = await runDiscardQueue(apiFetch, rowsOf(8));
    expect(res.stopped.code).toBe('network');
    expect(res.notSent.length).toBe(5);
  });

  it('isActive() false sends nothing', async () => {
    const res = await runDiscardQueue(apiFetch, rowsOf(4), { isActive: () => false });
    expect(mockDiscard).not.toHaveBeenCalled();
    expect(res.notSent).toHaveLength(4);
  });

  it('an empty list resolves with total 0', async () => {
    expect(await runDiscardQueue(apiFetch, [])).toMatchObject({ total: 0, ok: [], failed: [], notSent: [] });
  });
});

describe('discardToast', () => {
  const base = (over) => ({ total: 3, ok: [], failed: [], stopped: null, notSent: [], ...over });
  it('one success', () => {
    expect(discardToast(base({ total: 1, ok: ['a'] }))).toEqual({ tone: 'success', key: 'invoiceInboxDiscardedOne', params: {}, reason: null });
  });
  it('many successes carry the count', () => {
    expect(discardToast(base({ ok: ['a', 'b', 'c'] }))).toMatchObject({ tone: 'success', key: 'invoiceInboxDiscardedMany', params: { count: 3 } });
  });
  it('all failed with one shared reason', () => {
    const failed = [{ code: 'not_discardable', reasonKey: 'k1' }, { code: 'not_discardable', reasonKey: 'k1' }, { code: 'not_discardable', reasonKey: 'k1' }];
    const t = discardToast(base({ failed }));
    expect(t).toMatchObject({ tone: 'error', key: 'invoiceInboxDiscardFailed', reason: { reasonKey: 'k1' } });
  });
  it('all failed with several reasons uses the generic one', () => {
    const failed = [{ code: 'a', reasonKey: 'k1' }, { code: 'b', reasonKey: 'k2' }];
    expect(discardToast(base({ total: 2, failed })).reason).toEqual({ reasonKey: 'invoiceInboxDiscardReasonGeneric' });
  });
  it('partial: warning with ok/total/failed counting not-sent rows as failed, stopping reason wins', () => {
    const stopped = { code: 'feature_disabled', reasonKey: 'kf' };
    const t = discardToast(base({ total: 10, ok: ['a'], failed: [stopped, { code: 'x', reasonKey: 'kx' }], stopped, notSent: ['n1'] }));
    expect(t).toMatchObject({ tone: 'warning', key: 'invoiceInboxDiscardPartial', params: { ok: 1, total: 10, failed: 9 }, reason: stopped });
  });
  it('network reason carries reasonText', () => {
    const stopped = { code: 'network', reasonText: 'offline' };
    expect(discardToast(base({ total: 3, failed: [stopped], stopped, notSent: ['a', 'b'] })).reason).toEqual(stopped);
  });
  it('partial with a shared non-stopping reason', () => {
    const f = { code: 'not_discardable', reasonKey: 'k1' };
    expect(discardToast(base({ total: 2, ok: ['a'], failed: [f] })).reason).toBe(f);
  });
});

describe('useInvoiceInboxDiscard', () => {
  it('sends only selectable rows (PENDING_REVIEW, ERROR, READY)', async () => {
    mockDiscard.mockResolvedValue(OK);
    const { result } = renderHook(() => useInvoiceInboxDiscard(apiFetch));
    const rows = ['PROCESSING', 'PENDING_REVIEW', 'ERROR', 'READY', 'CONFIRMED', 'DISCARDED']
      .map((status, i) => ({ id: `s${i}`, status, fileName: 'x' }));
    let res;
    await act(async () => { res = await result.current.discard(rows); });
    expect(mockDiscard.mock.calls.map((c) => c[1]).sort()).toEqual(['s1', 's2', 's3']);
    expect(res.total).toBe(3);
  });

  it('exposes running while in flight and a second discard returns null without sending', async () => {
    let finish;
    mockDiscard.mockImplementation(() => new Promise((r) => { finish = () => r(OK); }));
    const { result } = renderHook(() => useInvoiceInboxDiscard(apiFetch));
    let first; let second;
    await act(async () => { first = result.current.discard(rowsOf(1)); });
    expect(result.current.running).toBe(true);
    await act(async () => { second = await result.current.discard(rowsOf(1)); });
    expect(second).toBeNull();
    expect(mockDiscard).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await first; });
    expect(result.current.running).toBe(false);
  });

  it('can discard again after the batch ends', async () => {
    mockDiscard.mockResolvedValue(OK);
    const { result } = renderHook(() => useInvoiceInboxDiscard(apiFetch));
    await act(async () => { await result.current.discard(rowsOf(1)); });
    let again;
    await act(async () => { again = await result.current.discard(rowsOf(1)); });
    expect(again).not.toBeNull();
  });

  it('after unmount nothing more is sent and it still resolves', async () => {
    const releases = [];
    mockDiscard.mockImplementation(() => new Promise((r) => { releases.push(() => r(OK)); }));
    const { result, unmount } = renderHook(() => useInvoiceInboxDiscard(apiFetch));
    let p;
    await act(async () => { p = result.current.discard(rowsOf(8)); });
    await waitFor(() => expect(mockDiscard).toHaveBeenCalledTimes(3));
    unmount();
    releases.forEach((r) => r());
    const res = await p;
    expect(mockDiscard).toHaveBeenCalledTimes(3);
    expect(res.notSent).toHaveLength(5);
  });

  it('treats null rows as an empty batch', async () => {
    const { result } = renderHook(() => useInvoiceInboxDiscard(apiFetch));
    let res;
    await act(async () => { res = await result.current.discard(null); });
    expect(res.total).toBe(0);
    expect(mockDiscard).not.toHaveBeenCalled();
  });
});
