// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxUpload.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxUploadLog.js
import { renderHook, act, waitFor } from '@testing-library/react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';

const mockUpload = vi.fn();
vi.mock('../invoiceInboxApi.js', () => ({ uploadInboxFile: (...args) => mockUpload(...args) }));

import { useInvoiceInboxUpload, UPLOAD_CONCURRENCY } from '../useInvoiceInboxUpload.js';
import { readUploadLog, uploadLogKey } from '../invoiceInboxUploadLog.js';

const apiFetch = vi.fn();
const files = (n) => Array.from({ length: n }, (_, i) => ({ name: `f${i}.pdf` }));

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function networkError(message) {
  const err = Object.assign(new Error(message), { name: 'NetworkError', code: 'NETWORK', reason: 'offline' });
  return err;
}

const statuses = (result) => result.current.items.map((i) => i.status);

beforeEach(() => { mockUpload.mockReset(); localStorage.clear(); });

describe('useInvoiceInboxUpload', () => {
  it('sends one request per file and counts the files the server answered for as X of N', async () => {
    mockUpload.mockResolvedValue({ status: 'accepted', id: 'D' });
    const onAccepted = vi.fn();
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { onAccepted }));
    act(() => result.current.enqueue(files(3)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(mockUpload.mock.calls.map(([, f]) => f.name)).toEqual(['f0.pdf', 'f1.pdf', 'f2.pdf']);
    expect(result.current.done).toBe(3);
    expect(result.current.total).toBe(3);
    expect(onAccepted).toHaveBeenCalledTimes(3);
  });

  it('runs at most 2 requests at the same time', async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let inFlight = 0; let peak = 0;
    mockUpload.mockImplementation(async (_api, file) => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      const out = await gates[Number(file.name[1])].promise;
      inFlight -= 1;
      return out;
    });
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch));
    act(() => result.current.enqueue(files(4)));
    expect(UPLOAD_CONCURRENCY).toBe(2);
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(statuses(result)).toEqual(['uploading', 'uploading', 'queued', 'queued']);
    expect(result.current.done).toBe(0);
    await act(async () => { gates[0].resolve({ status: 'accepted', id: '0' }); });
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(3));
    expect(result.current.done).toBe(1);
    await act(async () => { gates.slice(1).forEach((g, i) => g.resolve({ status: 'accepted', id: String(i) })); });
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(peak).toBe(2);
  });

  it('is closable (finished) only when every item is delivered or refused', async () => {
    const gate = deferred();
    mockUpload.mockReturnValue(gate.promise);
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch));
    expect(result.current.finished).toBe(false);
    act(() => result.current.enqueue(files(1)));
    expect(result.current.finished).toBe(false);
    await act(async () => { gate.resolve({ status: 'accepted', id: 'x' }); });
    await waitFor(() => expect(result.current.finished).toBe(true));
    act(() => result.current.clear());
    expect(result.current.items).toEqual([]);
    expect(result.current.finished).toBe(false);
  });

  it('marks a per-file refusal with its reason key and keeps the queue going', async () => {
    mockUpload
      .mockResolvedValueOnce({ status: 'rejected', code: 'unsupported_type' })
      .mockResolvedValueOnce({ status: 'accepted', id: 'D' });
    const onStopped = vi.fn();
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { onStopped }));
    act(() => result.current.enqueue(files(2)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(result.current.items[0]).toMatchObject({ status: 'rejected', reasonKey: 'invoiceInboxFileUnsupportedType' });
    expect(result.current.items[1].status).toBe('accepted');
    expect(onStopped).not.toHaveBeenCalled();
  });

  it('a new upload adds to the open tray (N grows)', async () => {
    mockUpload.mockResolvedValue({ status: 'accepted', id: 'D' });
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch));
    act(() => result.current.enqueue(files(1)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    act(() => result.current.enqueue(files(2)));
    expect(result.current.total).toBe(3);
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(result.current.done).toBe(3);
  });

  describe.each(['feature_disabled', 'access_denied', 'org_not_allowed'])('stopping code %s', (code) => {
    it('stops the queue: the files still queued are not sent and are marked refused, with ONE notice', async () => {
      mockUpload.mockResolvedValue({ status: 'failed', code });
      const onStopped = vi.fn();
      const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { onStopped }));
      act(() => result.current.enqueue(files(5)));
      await waitFor(() => expect(result.current.finished).toBe(true));
      // concurrency 2: only the first two were ever sent
      expect(mockUpload).toHaveBeenCalledTimes(2);
      expect(statuses(result)).toEqual(Array(5).fill('rejected'));
      expect(result.current.items[4].reasonKey).toBeTruthy();
      // both concurrent requests answered with a stop code, the notice must still fire once
      expect(onStopped).toHaveBeenCalledTimes(1);
    });
  });

  it('too_many_files does not stop the queue', async () => {
    mockUpload.mockResolvedValue({ status: 'failed', code: 'too_many_files' });
    const onStopped = vi.fn();
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { onStopped }));
    act(() => result.current.enqueue(files(3)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(onStopped).not.toHaveBeenCalled();
  });

  it('a NetworkError stops the queue with ONE notice carrying the translated message', async () => {
    const err = networkError('No se pudo completar la acción. Intenta nuevamente.');
    expect(isNetworkError(err)).toBe(true);
    mockUpload.mockRejectedValue(err);
    const onStopped = vi.fn();
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { onStopped }));
    act(() => result.current.enqueue(files(5)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(statuses(result)).toEqual(Array(5).fill('rejected'));
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(onStopped.mock.calls[0][0]).toEqual({ reasonText: err.message });
    expect(result.current.items[4]).toMatchObject({ status: 'rejected', reasonText: err.message });
  });

  it('a non-network exception only fails that file', async () => {
    mockUpload.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ status: 'accepted', id: 'D' });
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch));
    act(() => result.current.enqueue(files(3)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(result.current.items[0]).toMatchObject({ status: 'rejected', reasonKey: 'invoiceInboxUploadFailed' });
    expect(result.current.items[1].status).toBe('accepted');
    expect(result.current.items[2].status).toBe('accepted');
  });

  it('an AbortError (session changed mid-request) is unconfirmed, not refused, and refreshes the list', async () => {
    const abort = new DOMException('The request belongs to a superseded session.', 'AbortError');
    mockUpload.mockRejectedValueOnce(abort).mockResolvedValue({ status: 'accepted', id: 'D' });
    const onAccepted = vi.fn();
    const onStopped = vi.fn();
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { onAccepted, onStopped }));
    act(() => result.current.enqueue(files(3)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(result.current.items[0]).toMatchObject({ status: 'unconfirmed', reasonKey: 'invoiceInboxUploadUnconfirmed' });
    expect(statuses(result).slice(1)).toEqual(['accepted', 'accepted']);
    expect(result.current.done).toBe(3);
    // the list is refreshed for the unconfirmed file too: it is the only place that can tell
    expect(onAccepted).toHaveBeenCalledTimes(3);
    expect(onStopped).not.toHaveBeenCalled();
  });

  it('does not record an unconfirmed file in the upload log (no document id)', async () => {
    const KEY = uploadLogKey('C1', 'A1');
    mockUpload.mockRejectedValue(new DOMException('x', 'AbortError'));
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { logKey: KEY }));
    act(() => result.current.enqueue(files(1)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(readUploadLog(KEY)).toEqual([]);
  });

  it('an effect re-run that keeps the state resumes the queue instead of leaving files queued', async () => {
    const gates = [deferred(), deferred()];
    let n = 0;
    mockUpload.mockImplementation(() => gates[n++]?.promise ?? Promise.resolve({ status: 'accepted', id: 'x' }));
    // A new apiFetch re-runs the hook's effect (cleanup + setup) with its state kept, the same
    // shape React Fast Refresh produces in development.
    const { result, rerender } = renderHook(({ api }) => useInvoiceInboxUpload(api), { initialProps: { api: apiFetch } });
    act(() => result.current.enqueue(files(4)));
    expect(statuses(result)).toEqual(['uploading', 'uploading', 'queued', 'queued']);
    rerender({ api: vi.fn() });
    await act(async () => { gates.forEach((g) => g.resolve({ status: 'accepted', id: 'x' })); });
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(mockUpload).toHaveBeenCalledTimes(4);
    expect(statuses(result)).toEqual(Array(4).fill('accepted'));
  });

  it('on unmount the queue stops: no further sends and no state update', async () => {
    const gates = [deferred(), deferred()];
    let n = 0;
    mockUpload.mockImplementation(() => gates[n++]?.promise ?? Promise.resolve({ status: 'accepted', id: 'x' }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useInvoiceInboxUpload(apiFetch));
    act(() => result.current.enqueue(files(5)));
    expect(mockUpload).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { gates.forEach((g) => g.resolve({ status: 'accepted', id: 'x' })); });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('upload log recording', () => {
  const KEY = uploadLogKey('C1', 'A1');
  const ids = (key = KEY) => readUploadLog(key).map((e) => e.id);

  it('records the document id of every accepted file under the log key', async () => {
    let n = 0;
    mockUpload.mockImplementation(async () => ({ status: 'accepted', id: `D${++n}` }));
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { logKey: KEY }));
    act(() => result.current.enqueue(files(3)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(ids().sort()).toEqual(['D1', 'D2', 'D3']);
  });

  it('does not record refused or failed files', async () => {
    mockUpload
      .mockResolvedValueOnce({ status: 'rejected', code: 'unsupported_type' })
      .mockResolvedValueOnce({ status: 'failed', code: 'too_many_files' })
      .mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { logKey: KEY }));
    act(() => result.current.enqueue(files(3)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(ids()).toEqual([]);
  });

  it('records the id even when the hook unmounts mid-request', async () => {
    const gate = deferred();
    mockUpload.mockReturnValue(gate.promise);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useInvoiceInboxUpload(apiFetch, { logKey: KEY }));
    act(() => result.current.enqueue(files(1)));
    unmount();
    await act(async () => { gate.resolve({ status: 'accepted', id: 'LATE' }); });
    await new Promise((r) => setTimeout(r, 0));
    expect(ids()).toEqual(['LATE']);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('uses the key captured when the files were queued, not the one at answer time', async () => {
    const gate = deferred();
    mockUpload.mockReturnValue(gate.promise);
    const OTHER = uploadLogKey('C1', 'A2');
    const { result, rerender } = renderHook(({ logKey }) => useInvoiceInboxUpload(apiFetch, { logKey }), { initialProps: { logKey: KEY } });
    act(() => result.current.enqueue(files(1)));
    rerender({ logKey: OTHER });
    await act(async () => { gate.resolve({ status: 'accepted', id: 'D1' }); });
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(ids(KEY)).toEqual(['D1']);
    expect(ids(OTHER)).toEqual([]);
  });

  it('records nothing without a key', async () => {
    mockUpload.mockResolvedValue({ status: 'accepted', id: 'D1' });
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch));
    act(() => result.current.enqueue(files(1)));
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(localStorage.length).toBe(0);
  });

  it('returns pending = files still queued or sending', async () => {
    const gates = [deferred(), deferred(), deferred()];
    let n = 0;
    mockUpload.mockImplementation(() => gates[n++].promise);
    const { result } = renderHook(() => useInvoiceInboxUpload(apiFetch, { logKey: KEY }));
    expect(result.current.pending).toBe(0);
    act(() => result.current.enqueue(files(3)));
    expect(result.current.pending).toBe(3);
    await act(async () => { gates[0].resolve({ status: 'accepted', id: 'a' }); });
    await waitFor(() => expect(result.current.pending).toBe(2));
    await act(async () => { gates[1].resolve({ status: 'accepted', id: 'b' }); gates[2].resolve({ status: 'accepted', id: 'c' }); });
    await waitFor(() => expect(result.current.pending).toBe(0));
  });
});
