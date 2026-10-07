// @covers tools/app-shell/src/components/attachments/useAttachments.js
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock i18n hooks before importing the hook under test.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Mock sonner toasts to capture calls without rendering anything.
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { useAttachments } from '../useAttachments';
import { ATTACHMENTS_CHANGED_EVENT, notifyAttachmentsChanged } from '../attachmentsBus';
import { toast } from 'sonner';

const baseOpts = {
  tableName: 'C_Order',
  recordId: 'REC-1',
  token: 'tok-123',
  apiBaseUrl: 'http://api.test',
  isActive: true,
  config: { maxSizeMB: 10 },
};

/** Build a Response-like object backed by vi.fn returns. */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    clone() { return jsonResponse(body, { ok, status }); },
    blob: vi.fn().mockResolvedValue(new Blob(['x'])),
  };
}

describe('useAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    // Stub URL and anchor APIs used by triggerBlobDownload to avoid jsdom warnings.
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('list() loads items from response.items into state', async () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    globalThis.fetch.mockResolvedValue(jsonResponse({ items }));

    const { result } = renderHook(() => useAttachments(baseOpts));

    // The hook auto-lists on mount because isActive is true.
    await waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('list() on 401 sets error and shows toast.error', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, { ok: false, status: 401 }));

    const { result } = renderHook(() => useAttachments(baseOpts));

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.items).toEqual([]);
    // ETP-5526: a failed first read leaves the count unknown, not a real 0.
    expect(result.current.loaded).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it('list() on 500 sets error', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));

    const { result } = renderHook(() => useAttachments(baseOpts));

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(toast.error).toHaveBeenCalled();
  });

  it('upload(file) POSTs multipart and refreshes the list when server returns no id', async () => {
    // First call: initial list().
    // Second call: POST upload (no id, triggers fallback list).
    // Third call: refresh list().
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'new', name: 'f.pdf' }] }));

    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await act(async () => {
      await result.current.upload(file);
    });

    // POST was sent to the right endpoint with FormData and Authorization header.
    const postCall = globalThis.fetch.mock.calls[1];
    expect(postCall[0]).toBe('http://api.test/sws/neo/attachments/C_Order/REC-1');
    expect(postCall[1].method).toBe('POST');
    expect(postCall[1].body).toBeInstanceOf(FormData);
    expect(postCall[1].headers.Authorization).toBe('Bearer tok-123');
    // The fallback list call refreshed items.
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(toast.success).toHaveBeenCalled();
  });

  // ETP-5309: an unsaved record's id is the literal "new"; POSTing against it made the
  // backend answer a raw 500. The opts.recordId override (saveBeforeAttach) still uploads.
  it('upload(file) sends nothing while the record is "new", but honours opts.recordId', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ id: 'fresh', name: 'f.pdf' }));
    const { result } = renderHook(() => useAttachments({ ...baseOpts, recordId: 'new' }));

    const file = new File(['x'], 'x.pdf', { type: 'application/pdf' });
    await act(async () => {
      await result.current.upload(file);
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.upload(file, { recordId: 'REC-SAVED' });
    });
    expect(globalThis.fetch.mock.calls[0][0]).toBe('http://api.test/sws/neo/attachments/C_Order/REC-SAVED');
  });

  it('upload(file) prepends the created record to items when response contains an id', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'old' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'fresh', name: 'fresh.pdf' }));

    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const file = new File(['x'], 'x.pdf', { type: 'application/pdf' });
    await act(async () => {
      await result.current.upload(file);
    });

    expect(result.current.items.map((i) => i.id)).toEqual(['fresh', 'old']);
    expect(toast.success).toHaveBeenCalled();
  });

  it('remove(id) optimistically removes the item and calls DELETE', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'x' }, { id: 'y' }] }))
      .mockResolvedValueOnce(jsonResponse({}));

    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      await result.current.remove('x');
    });

    expect(result.current.items.map((i) => i.id)).toEqual(['y']);
    const delCall = globalThis.fetch.mock.calls[1];
    expect(delCall[0]).toBe('http://api.test/sws/neo/attachments/file/x');
    expect(delCall[1].method).toBe('DELETE');
    expect(toast.success).toHaveBeenCalled();
  });

  it('remove(id) rollbacks the state when DELETE fails', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'x' }, { id: 'y' }] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'boom' }, { ok: false, status: 500 }));

    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      await result.current.remove('x');
    });

    // After the failed DELETE the rollback restores the snapshot.
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['x', 'y']));
    expect(toast.error).toHaveBeenCalled();
  });

  it('updateDescription(id, desc) optimistically updates and sends PATCH', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'a', description: 'old' }] }))
      .mockResolvedValueOnce(jsonResponse({}));

    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.updateDescription('a', 'new desc');
    });

    expect(result.current.items[0].description).toBe('new desc');
    const patchCall = globalThis.fetch.mock.calls[1];
    expect(patchCall[1].method).toBe('PATCH');
    expect(JSON.parse(patchCall[1].body)).toEqual({ description: 'new desc' });
    expect(toast.success).toHaveBeenCalled();
  });

  it('updateDescription(id, desc) rollbacks state when PATCH fails', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'a', description: 'old' }] }))
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.updateDescription('a', 'new desc');
    });

    await waitFor(() => expect(result.current.items[0].description).toBe('old'));
    expect(toast.error).toHaveBeenCalled();
  });

  it('does not leave loading stuck true when a stale list() is superseded by a successful upload (review finding)', async () => {
    // Initial mount list() resolves immediately and empty.
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ items: [] }));
    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // A second list() call is deliberately left unresolved (simulates the
    // saveBeforeAttach flow's mount-effect list() still in flight when the
    // triggering upload() completes and bumps the generation).
    let resolveStaleList;
    globalThis.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveStaleList = resolve; }));
    let staleListPromise;
    act(() => {
      staleListPromise = result.current.list();
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    // upload() succeeds with an id — its own generation bump makes the still-
    // pending list() call above stale.
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ id: 'fresh', name: 'fresh.pdf' }));
    const file = new File(['x'], 'x.pdf', { type: 'application/pdf' });
    await act(async () => {
      await result.current.upload(file);
    });
    expect(result.current.items.map((i) => i.id)).toEqual(['fresh']);

    // The stale list() finally resolves — its own loading must still clear,
    // even though its data is discarded as superseded.
    await act(async () => {
      resolveStaleList(jsonResponse({ items: [{ id: 'discarded' }] }));
      await staleListPromise;
    });
    expect(result.current.loading).toBe(false);
    // The discarded response never overwrote the upload's own optimistic item.
    expect(result.current.items.map((i) => i.id)).toEqual(['fresh']);
  });

  it('aborts the inflight list() request when the record changes', async () => {
    // Slow-controlled fetch lets us inspect the AbortSignal.
    let firstSignal;
    globalThis.fetch.mockImplementation((url, opts) => {
      if (!firstSignal) firstSignal = opts?.signal;
      return new Promise(() => {
        // never resolves in this test; we just want the signal to fire abort
      });
    });

    const { rerender } = renderHook(({ recordId }) => useAttachments({ ...baseOpts, recordId }), {
      initialProps: { recordId: 'REC-1' },
    });

    // Wait one tick so the initial fetch is initiated.
    await act(async () => { await Promise.resolve(); });
    expect(firstSignal).toBeDefined();
    expect(firstSignal.aborted).toBe(false);

    rerender({ recordId: 'REC-2' });

    // The previous signal must be aborted by the time the new list() starts.
    await waitFor(() => expect(firstSignal.aborted).toBe(true));
  });

  it('aborts the inflight list() request when the component unmounts', async () => {
    let capturedSignal;
    globalThis.fetch.mockImplementation((url, opts) => {
      capturedSignal = opts?.signal;
      return new Promise(() => {});
    });

    const { unmount } = renderHook(() => useAttachments(baseOpts));
    await act(async () => { await Promise.resolve(); });
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal.aborted).toBe(false);

    unmount();

    expect(capturedSignal.aborted).toBe(true);
  });
});

/**
 * ETP-5526 — the tab badge showed "0" until the tab was opened (lazy load,
 * ETP-4564). `loaded` tells the consumer whether `items.length` is the real
 * count of the current record or still unknown.
 */
describe('useAttachments — loaded flag (ETP-5526)', () => {
  const isGet = (call) => (call[1]?.method ?? 'GET').toUpperCase() === 'GET';
  const pdf = () => new File(['x'], 'x.pdf', { type: 'application/pdf' });

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays not-loaded while the tab is inactive and becomes loaded after the read on activation', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }, { id: 'b' }] }));

    const { result, rerender } = renderHook(
      ({ isActive }) => useAttachments({ ...baseOpts, isActive }),
      { initialProps: { isActive: false } },
    );
    await act(async () => {});
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);
    expect(result.current.items).toEqual([]);

    rerender({ isActive: true });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('drops the previous record list and loaded state as soon as the record changes', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }] }));

    const { result, rerender } = renderHook(
      ({ recordId, isActive }) => useAttachments({ ...baseOpts, recordId, isActive }),
      { initialProps: { recordId: 'REC-1', isActive: true } },
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const callsAfterLoad = globalThis.fetch.mock.calls.length;

    // Inactive so no read for REC-2 can mask what the first render exposes.
    rerender({ recordId: 'REC-2', isActive: false });
    expect(result.current.loaded).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(globalThis.fetch.mock.calls.length).toBe(callsAfterLoad);
  });

  it('upload on an active, never-loaded list re-reads the server list instead of prepending', async () => {
    const serverList = [{ id: 'fresh' }, { id: 'older-1' }, { id: 'older-2' }];
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 })) // first read fails
      .mockResolvedValueOnce(jsonResponse({ id: 'fresh', name: 'x.pdf' })) // POST
      .mockResolvedValueOnce(jsonResponse({ items: serverList })); // forced GET

    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.loaded).toBe(false);

    await act(async () => { await result.current.upload(pdf()); });

    const calls = globalThis.fetch.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[1][1].method).toBe('POST');
    expect(isGet(calls[2])).toBe(true);
    expect(calls[2][0]).toBe('http://api.test/sws/neo/attachments/C_Order/REC-1');
    expect(result.current.items).toEqual(serverList);
    expect(result.current.loaded).toBe(true);
  });

  it('upload on an inactive, never-loaded list prepends without a read and stays not-loaded', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ id: 'fresh', name: 'x.pdf' }));

    const { result } = renderHook(() => useAttachments({ ...baseOpts, isActive: false }));
    await act(async () => { await result.current.upload(pdf()); });

    const calls = globalThis.fetch.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][1].method).toBe('POST');
    expect(result.current.items.map((i) => i.id)).toEqual(['fresh']);
    expect(result.current.loaded).toBe(false);
  });

  // W1: the user navigates A → C while A's upload POST is in flight. When the
  // POST resolves, the upload must not adopt A's list (forced read or prepend)
  // over C's — that left an empty table and no badge on C.
  it.each([
    ['C already loaded when the POST resolves', { cReadPending: false, postBody: { id: 'fresh', name: 'x.pdf' } }],
    ['C read still pending when the POST resolves', { cReadPending: true, postBody: { id: 'fresh', name: 'x.pdf' } }],
    ['POST returns no id, C already loaded', { cReadPending: false, postBody: {} }],
  ])('upload resolving after navigating away keeps the new record list: %s', async (_label, { cReadPending, postBody }) => {
    const urlA = 'http://api.test/sws/neo/attachments/C_Order/REC-A';
    const urlC = 'http://api.test/sws/neo/attachments/C_Order/REC-C';
    let resolvePost;
    let resolveCRead;
    globalThis.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method ?? 'GET').toUpperCase();
      if (url === urlA && method === 'POST') {
        return new Promise((resolve) => { resolvePost = resolve; });
      }
      if (url === urlA) return Promise.resolve(jsonResponse({ items: [{ id: 'a1' }] }));
      if (url === urlC && cReadPending) {
        return new Promise((resolve) => { resolveCRead = resolve; });
      }
      if (url === urlC) return Promise.resolve(jsonResponse({ items: [{ id: 'c1' }] }));
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });
    const getsOf = (url) => globalThis.fetch.mock.calls
      .filter((call) => call[0] === url && isGet(call)).length;

    const { result, rerender } = renderHook(
      ({ recordId }) => useAttachments({ ...baseOpts, recordId, isActive: true }),
      { initialProps: { recordId: 'REC-A' } },
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items.map((i) => i.id)).toEqual(['a1']);

    let uploadPromise;
    act(() => { uploadPromise = result.current.upload(pdf()); });
    await waitFor(() => expect(resolvePost).toBeTypeOf('function'));
    const getsOfABeforePostResolves = getsOf(urlA);

    rerender({ recordId: 'REC-C' });
    if (cReadPending) {
      await waitFor(() => expect(resolveCRead).toBeTypeOf('function'));
    } else {
      await waitFor(() => expect(result.current.loaded).toBe(true));
      expect(result.current.items.map((i) => i.id)).toEqual(['c1']);
    }

    await act(async () => {
      resolvePost(jsonResponse(postBody));
      await uploadPromise;
    });
    if (cReadPending) {
      // C's read was started before the POST resolved; it must not be
      // discarded as superseded by the upload.
      await act(async () => { resolveCRead(jsonResponse({ items: [{ id: 'c1' }] })); });
    }

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items.map((i) => i.id)).toEqual(['c1']);
    expect(getsOf(urlA)).toBe(getsOfABeforePostResolves);
    expect(toast.success).toHaveBeenCalled();
  });
});

/**
 * ETP-5526 — `prefetchCount`: a badge consumer reads only the attachment COUNT
 * while the tab is inactive (the full list stays lazy, ETP-4564). The count is
 * optional: any failure leaves it `null` silently.
 */
describe('useAttachments — prefetchCount (ETP-5526)', () => {
  const BASE = 'http://api.test/sws/neo/attachments/C_Order';
  const isCountUrl = (url) => url.endsWith('/count');
  const isListGet = (call) => !isCountUrl(call[0])
    && /\/attachments\/C_Order\/[^/]+$/.test(call[0])
    && (call[1]?.method ?? 'GET').toUpperCase() === 'GET';
  const countRequests = () => globalThis.fetch.mock.calls.filter((c) => isCountUrl(c[0])).length;
  const listRequests = () => globalThis.fetch.mock.calls.filter(isListGet).length;
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  /** Answers count GETs, list GETs and POSTs from the given handlers. */
  function route({ count, list = () => jsonResponse({ items: [] }), post } = {}) {
    globalThis.fetch.mockImplementation((url, opts = {}) => {
      const method = (opts.method ?? 'GET').toUpperCase();
      if (method === 'POST') return Promise.resolve(post(url));
      if (isCountUrl(url)) return count(url);
      return Promise.resolve(list(url));
    });
  }

  let debugSpy;
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    // fetchCount logs (debug) when the count is unavailable — silence it.
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['inactive + prefetchCount → one count request, no list, count from the endpoint',
      { isActive: false, prefetchCount: true }, { countReqs: 1, listReqs: 0, count: 4 }],
    ['active + prefetchCount → no count request, count follows the list length',
      { isActive: true, prefetchCount: true }, { countReqs: 0, listReqs: 1, count: 2 }],
    ['inactive without prefetchCount → no request at all, count unknown',
      { isActive: false, prefetchCount: false }, { countReqs: 0, listReqs: 0, count: null }],
  ])('%s', async (_label, hookOpts, expected) => {
    route({
      count: () => Promise.resolve(jsonResponse({ count: 4 })),
      list: () => jsonResponse({ items: [{ id: 'a' }, { id: 'b' }] }),
    });

    const { result } = renderHook(() => useAttachments({ ...baseOpts, ...hookOpts }));
    await waitFor(() => expect(result.current.count).toBe(expected.count));
    await settle();

    expect(result.current.count).toBe(expected.count);
    expect(countRequests()).toBe(expected.countReqs);
    expect(listRequests()).toBe(expected.listReqs);
  });

  it.each([
    ['404 (backend without the endpoint)', () => Promise.resolve(jsonResponse({ message: 'nope' }, { ok: false, status: 404 }))],
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['body without a count', () => Promise.resolve(jsonResponse({ total: 3 }))],
  ])('count failure leaves count null without a toast: %s', async (_label, count) => {
    route({ count });

    const { result } = renderHook(() => useAttachments({ ...baseOpts, isActive: false, prefetchCount: true }));
    // The failure path logs once it has handled the error — the settle signal.
    await waitFor(() => expect(debugSpy).toHaveBeenCalled());
    await settle();

    expect(countRequests()).toBeGreaterThan(0);
    expect(result.current.count).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([
    ['old record answers first', 'old-first'],
    ['old record answers last', 'old-last'],
  ])('never shows the previous record count after a record change: %s', async (_label, order) => {
    const pending = {};
    route({
      count: (url) => new Promise((resolve) => { pending[url] = resolve; }),
    });
    const resolveCount = (recordId, n) => act(async () => {
      pending[`${BASE}/${recordId}/count`](jsonResponse({ count: n }));
    });

    const { result, rerender } = renderHook(
      ({ recordId }) => useAttachments({ ...baseOpts, recordId, isActive: false, prefetchCount: true }),
      { initialProps: { recordId: 'REC-OLD' } },
    );
    await waitFor(() => expect(pending[`${BASE}/REC-OLD/count`]).toBeTypeOf('function'));

    rerender({ recordId: 'REC-NEW' });
    await waitFor(() => expect(pending[`${BASE}/REC-NEW/count`]).toBeTypeOf('function'));

    if (order === 'old-first') {
      await resolveCount('REC-OLD', 3);
      await settle();
      expect(result.current.count).toBeNull();
      await resolveCount('REC-NEW', 7);
    } else {
      await resolveCount('REC-NEW', 7);
      await waitFor(() => expect(result.current.count).toBe(7));
      await resolveCount('REC-OLD', 3);
    }
    await settle();

    expect(result.current.count).toBe(7);
  });

  it('refreshes only the count (no list request) when another view changes an unloaded record', async () => {
    let serverCount = 1;
    route({ count: () => Promise.resolve(jsonResponse({ count: serverCount })) });

    const { result } = renderHook(() => useAttachments({ ...baseOpts, isActive: false, prefetchCount: true }));
    await waitFor(() => expect(result.current.count).toBe(1));

    serverCount = 2;
    act(() => {
      notifyAttachmentsChanged({ tableName: baseOpts.tableName, recordId: baseOpts.recordId, source: 'the-side-panel' });
    });

    await waitFor(() => expect(result.current.count).toBe(2));
    await settle();
    expect(countRequests()).toBe(2);
    expect(listRequests()).toBe(0);
  });

  it('re-reads the count after an upload on an inactive, unloaded record', async () => {
    let serverCount = 1;
    route({
      count: () => Promise.resolve(jsonResponse({ count: serverCount })),
      post: () => jsonResponse({ id: 'fresh', name: 'x.pdf' }),
    });

    const { result } = renderHook(() => useAttachments({ ...baseOpts, isActive: false, prefetchCount: true }));
    await waitFor(() => expect(result.current.count).toBe(1));

    serverCount = 2;
    await act(async () => {
      await result.current.upload(new File(['x'], 'x.pdf', { type: 'application/pdf' }));
    });

    await waitFor(() => expect(result.current.count).toBe(2));
    expect(result.current.loaded).toBe(false);
    expect(countRequests()).toBe(2);
    expect(listRequests()).toBe(0);
  });
});

/**
 * ETP-4855 — this tab and the OCR side panel each keep their own copy of the
 * list and are mounted together in form view. Reported symptom: a file attached
 * from the panel did not appear here until leaving form view and coming back.
 */
describe('useAttachments — cross-view sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads when another view attaches a file to this record', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }] }));
    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // The side panel uploaded one: the next listing returns both.
    globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }, { id: 'b' }] }));
    act(() => {
      notifyAttachmentsChanged({
        tableName: baseOpts.tableName,
        recordId: baseOpts.recordId,
        source: 'the-side-panel',
      });
    });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
  });

  it('ignores a change to a different record', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }] }));
    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const callsAfterLoad = globalThis.fetch.mock.calls.length;

    act(() => {
      notifyAttachmentsChanged({
        tableName: baseOpts.tableName,
        recordId: 'SOME-OTHER-RECORD',
        source: 'the-side-panel',
      });
    });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(globalThis.fetch.mock.calls.length).toBe(callsAfterLoad);
  });

  it('announces its own upload so the side panel reloads', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ id: 'new-1' }));
    const { result } = renderHook(() => useAttachments(baseOpts));

    const seen = [];
    const listener = (event) => seen.push(event.detail);
    window.addEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    try {
      await act(async () => {
        await result.current.upload(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
      });
      await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    } finally {
      window.removeEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    }

    expect(seen[0]).toMatchObject({
      tableName: baseOpts.tableName,
      recordId: baseOpts.recordId,
    });
  });

  it('announces a delete so the side panel stops showing the file', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }] }));
    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const seen = [];
    const listener = (event) => seen.push(event.detail);
    window.addEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    try {
      await act(async () => { await result.current.remove('a'); });
      await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    } finally {
      window.removeEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    }

    expect(seen[0]).toMatchObject({ recordId: baseOpts.recordId });
  });

  it('stays quiet when a delete fails', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }] }));
    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    globalThis.fetch.mockResolvedValue(jsonResponse({ message: 'nope' }, { ok: false, status: 500 }));
    const listener = vi.fn();
    window.addEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    try {
      await act(async () => { await result.current.remove('a'); });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    }
    // Optimistic removal rolled back.
    expect(result.current.items).toHaveLength(1);
  });

  it('does not reload in response to its own announcement', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }] }));
    const { result } = renderHook(() => useAttachments(baseOpts));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    globalThis.fetch.mockResolvedValue(jsonResponse({ id: 'new-1' }));
    await act(async () => {
      await result.current.upload(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    });
    const callsAfterUpload = globalThis.fetch.mock.calls.length;

    // Settle any listener-triggered reload that should not exist.
    await act(async () => { await Promise.resolve(); });
    expect(globalThis.fetch.mock.calls.length).toBe(callsAfterUpload);
  });
});
