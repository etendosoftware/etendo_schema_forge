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
