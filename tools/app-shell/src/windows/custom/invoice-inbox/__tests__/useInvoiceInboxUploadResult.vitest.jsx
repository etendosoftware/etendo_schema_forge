// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxUploadResult.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxApi.js
// New file justification: useInvoiceInboxUploadResult.js is a new hook; the real chunker
// (fetchRowsByIdChunked) is exercised over a fake apiFetch, so the request count is observable.
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useInvoiceInboxUploadResult, useUploadLogKey,
} from '../useInvoiceInboxUploadResult.js';
import { appendUploadLog, readUploadLog, uploadLogKey } from '../invoiceInboxUploadLog.js';

let mockAuth = null;
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => mockAuth,
}));

const KEY = uploadLogKey('C1', 'A1');
const T0 = Date.now() - 60_000; // recent enough not to be expired
const json = (data) => ({ ok: true, status: 200, json: async () => ({ response: { data, totalRows: data.length } }) });
const idsOf = (url) => JSON.parse(new URLSearchParams(url.split('?')[1]).get('criteria'))[0].value;

/** apiFetch over a table of rows by id; ids missing from the table are "not returned". */
function backend(table) {
  return vi.fn(async (url) => json(idsOf(url).flatMap((id) => (table[id] ? [table[id]] : []))));
}

beforeEach(() => { localStorage.clear(); mockAuth = { clientId: 'C1', account: { id: 'A1' } }; });

describe('useUploadLogKey', () => {
  it('derives the key from the signed-in company and account; null when unknown', () => {
    const { result, rerender } = renderHook(() => useUploadLogKey());
    expect(result.current).toBe(KEY);
    mockAuth = { clientId: 'C1' };
    rerender();
    expect(result.current).toBeNull();
    mockAuth = null;
    rerender();
    expect(result.current).toBeNull();
  });
});

describe('useInvoiceInboxUploadResult', () => {
  it('reads nothing when nothing is recorded', async () => {
    const apiFetch = backend({});
    const { result } = renderHook(() => useInvoiceInboxUploadResult(apiFetch, KEY));
    expect(result.current.ids).toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('reads the recorded ids in chunks of 50 (the 100-entry cap = 2 requests) and summarizes them', async () => {
    const table = {};
    for (let i = 0; i < 100; i += 1) { appendUploadLog(KEY, `d${i}`, T0 + 1000 + i); table[`d${i}`] = { id: `d${i}`, status: 'READY' }; }
    const apiFetch = backend(table);
    const { result } = renderHook(() => useInvoiceInboxUploadResult(apiFetch, KEY));
    await waitFor(() => expect(result.current.summary.read).toBe(100));
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch.mock.calls.map(([url]) => idsOf(url).length).sort((a, b) => a - b)).toEqual([50, 50]);
  });

  it('an id the server does not return becomes "gone"', async () => {
    appendUploadLog(KEY, 'here', T0 + 1000); appendUploadLog(KEY, 'missing', T0 + 2000);
    const { result } = renderHook(() => useInvoiceInboxUploadResult(backend({ here: { id: 'here', status: 'ERROR', errorCode: 'UNREADABLE' } }), KEY));
    await waitFor(() => expect(result.current.summary.gone).toBe(1));
    expect(result.current.summary.failed).toBe(1);
  });

  it('reads only the unknown ids when a new one is recorded', async () => {
    appendUploadLog(KEY, 'a', T0 + 1000);
    const apiFetch = backend({ a: { id: 'a', status: 'READY' }, b: { id: 'b', status: 'READY' } });
    const { result } = renderHook(() => useInvoiceInboxUploadResult(apiFetch, KEY));
    await waitFor(() => expect(result.current.summary.read).toBe(1));
    act(() => appendUploadLog(KEY, 'b', T0 + 2000));
    await waitFor(() => expect(result.current.summary.read).toBe(2));
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(idsOf(apiFetch.mock.calls[1][0])).toEqual(['b']);
  });

  it('picks up a write from another tab (storage event)', async () => {
    const apiFetch = backend({ x: { id: 'x', status: 'READY' } });
    const { result } = renderHook(() => useInvoiceInboxUploadResult(apiFetch, KEY));
    expect(result.current.ids).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: [{ id: 'x', at: Date.now() }] }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY })); });
    await waitFor(() => expect(result.current.summary.read).toBe(1));
  });

  it('mergeRows stores the answer only for recorded ids (and marks a missing one gone)', async () => {
    appendUploadLog(KEY, 'a', T0 + 1000);
    const apiFetch = backend({ a: { id: 'a', status: 'PROCESSING' } });
    const { result } = renderHook(() => useInvoiceInboxUploadResult(apiFetch, KEY));
    await waitFor(() => expect(result.current.summary.pending).toBe(1));
    act(() => result.current.mergeRows(['a', 'stranger'], [{ id: 'a', status: 'READY' }, { id: 'stranger', status: 'ERROR' }]));
    expect(result.current.summary.read).toBe(1);
    expect(result.current.summary.total).toBe(1);
    expect(result.current.summary.failed).toBe(0);
    act(() => result.current.mergeRows(['a'], []));
    expect(result.current.summary.gone).toBe(1);
  });

  it('dismiss removes the finished documents from the record and keeps the ones still being read', async () => {
    appendUploadLog(KEY, 'done', T0 + 1000); appendUploadLog(KEY, 'busy', T0 + 2000);
    const apiFetch = backend({ done: { id: 'done', status: 'READY' }, busy: { id: 'busy', status: 'PROCESSING' } });
    const { result } = renderHook(() => useInvoiceInboxUploadResult(apiFetch, KEY));
    await waitFor(() => expect(result.current.summary.total).toBe(2));
    await waitFor(() => expect(result.current.summary.pending).toBe(1));
    act(() => result.current.dismiss());
    expect(readUploadLog(KEY).map((e) => e.id)).toEqual(['busy']);
    await waitFor(() => expect(result.current.ids).toEqual(['busy']));
  });

  it('loadError shows only while nothing is known, and retry clears it', async () => {
    appendUploadLog(KEY, 'a', T0 + 1000);
    let fail = true;
    const apiFetch = vi.fn(async (url) => (fail ? { ok: false, status: 500, json: async () => ({}) } : json(idsOf(url).map((id) => ({ id, status: 'READY' })))));
    const { result } = renderHook(() => useInvoiceInboxUploadResult(apiFetch, KEY));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    fail = false;
    await act(async () => { result.current.retry(); });
    await waitFor(() => expect(result.current.loadError).toBe(false));
    expect(result.current.summary.read).toBe(1);
  });

  it('a later failure keeps the known result (no loadError once something is known)', async () => {
    appendUploadLog(KEY, 'a', T0 + 1000);
    let fail = false;
    const apiFetch = vi.fn(async (url) => (fail ? { ok: false, status: 500, json: async () => ({}) } : json(idsOf(url).map((id) => ({ id, status: 'READY' })))));
    const { result } = renderHook(() => useInvoiceInboxUploadResult(apiFetch, KEY));
    await waitFor(() => expect(result.current.summary.read).toBe(1));
    fail = true;
    await act(async () => { result.current.retry(); });
    expect(result.current.loadError).toBe(false);
    expect(result.current.summary.read).toBe(1);
  });

  it('without a key it records and reads nothing', () => {
    const apiFetch = backend({});
    const { result } = renderHook(() => useInvoiceInboxUploadResult(apiFetch, null));
    expect(result.current.ids).toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
