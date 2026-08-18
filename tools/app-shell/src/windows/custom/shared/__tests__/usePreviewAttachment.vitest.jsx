// --- Mocks ---

// --- Import under test ---

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePreviewAttachment, ACCEPTED_TYPES, ACCEPT_ATTR } from '../usePreviewAttachment.js';
// Real bus and real attachments transport — both contracts are what broke.
import {
  ATTACHMENTS_CHANGED_EVENT,
  notifyAttachmentsChanged,
} from '@/components/attachments/attachmentsBus';

// --- Tests ---

describe('usePreviewAttachment', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial idle state when inactive', () => {
    const { result } = renderHook(() => usePreviewAttachment());
    expect(result.current.storedFile).toBe(null);
    expect(result.current.isBusy).toBe(false);
    expect(result.current.storeFailed).toBe(false);
    expect(typeof result.current.storeFile).toBe('function');
    expect(typeof result.current.storeBlob).toBe('function');
    expect(typeof result.current.storeUrl).toBe('function');
    expect(typeof result.current.deleteFile).toBe('function');
  });

  it('does not fetch when storeCondition is false', () => {
    renderHook(() =>
      usePreviewAttachment({
        documentId: 'doc-1',
        specName: 'sales-invoice',
        storeCondition: false,
        token: 'tok',
        apiBaseUrl: '/sws/neo/sales-invoice',
      }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when documentId is missing', () => {
    renderHook(() =>
      usePreviewAttachment({
        documentId: null,
        specName: 'sales-invoice',
        storeCondition: true,
        token: 'tok',
        apiBaseUrl: '/sws/neo/sales-invoice',
      }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when token is missing', () => {
    renderHook(() =>
      usePreviewAttachment({
        documentId: 'doc-1',
        specName: 'sales-invoice',
        storeCondition: true,
        token: null,
        apiBaseUrl: '/sws/neo/sales-invoice',
      }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches on mount when active', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    renderHook(() =>
      usePreviewAttachment({
        documentId: 'doc-1',
        specName: 'sales-invoice',
        storeCondition: true,
        token: 'tok',
        apiBaseUrl: '/sws/neo/sales-invoice',
      }),
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('/preview-file');
    expect(url).toContain('specName=sales-invoice');
    expect(url).toContain('recordId=doc-1');
  });

  it('handles fetch error gracefully', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network'));

    const { result } = renderHook(() =>
      usePreviewAttachment({
        documentId: 'doc-1',
        specName: 'sales-invoice',
        storeCondition: true,
        token: 'tok',
        apiBaseUrl: '/sws/neo/sales-invoice',
      }),
    );

    await waitFor(() => {
      expect(result.current.isBusy).toBe(false);
    });
    expect(result.current.storedFile).toBe(null);
  });

  it('exports ACCEPTED_TYPES with expected keys', () => {
    expect(ACCEPTED_TYPES['application/pdf']).toBe('pdf');
    expect(ACCEPTED_TYPES['image/jpeg']).toBe('image');
    expect(ACCEPTED_TYPES['image/png']).toBe('image');
  });

  it('exports ACCEPT_ATTR as comma-separated string', () => {
    expect(typeof ACCEPT_ATTR).toBe('string');
    expect(ACCEPT_ATTR).toContain('application/pdf');
    expect(ACCEPT_ATTR).toContain('image/jpeg');
  });

  it('storeFile is no-op when inactive', async () => {
    const { result } = renderHook(() => usePreviewAttachment());
    await act(async () => {
      await result.current.storeFile(new File(['test'], 'test.pdf', { type: 'application/pdf' }));
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('deleteFile is no-op when inactive', async () => {
    const { result } = renderHook(() => usePreviewAttachment());
    await act(async () => {
      await result.current.deleteFile();
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when specName is missing', () => {
    renderHook(() =>
      usePreviewAttachment({
        documentId: 'doc-1',
        specName: null,
        storeCondition: true,
        token: 'tok',
        apiBaseUrl: '/sws/neo/sales-invoice',
      }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when apiBaseUrl is missing', () => {
    renderHook(() =>
      usePreviewAttachment({
        documentId: 'doc-1',
        specName: 'sales-invoice',
        storeCondition: true,
        token: 'tok',
        apiBaseUrl: null,
      }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  const activeParams = {
    documentId: 'doc-1',
    specName: 'sales-invoice',
    storeCondition: true,
    token: 'tok',
    apiBaseUrl: '/sws/neo/sales-invoice',
  };

  describe('active hook — server restore and writes', () => {
    beforeEach(() => {
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
      globalThis.URL.revokeObjectURL = vi.fn();
    });

    it('restores a stored file found on the server (base64 decode + Blob URL)', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          fileData: btoa('hello'),
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
        }),
      });

      const { result } = renderHook(() => usePreviewAttachment(activeParams));

      await waitFor(() => expect(result.current.isBusy).toBe(false));
      expect(result.current.storedFile).toEqual({
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        objectUrl: 'blob:fake',
      });
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    });

    it('storeFile POSTs the file and stores the resulting blob', async () => {
      globalThis.fetch = vi.fn(async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'GET') return { ok: true, json: () => Promise.resolve({}) };
        if (method === 'POST') return { ok: true };
        throw new Error(`unexpected ${method} ${url}`);
      });

      const { result } = renderHook(() => usePreviewAttachment(activeParams));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });
      await act(async () => {
        await result.current.storeFile(file);
      });

      expect(result.current.storeFailed).toBe(false);
      expect(result.current.storedFile).toEqual({
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        objectUrl: 'blob:fake',
      });
    });

    it('storeFile sets storeFailed when the POST fails', async () => {
      globalThis.fetch = vi.fn(async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'GET') return { ok: true, json: () => Promise.resolve({}) };
        if (method === 'POST') return { ok: false, status: 500 };
        throw new Error(`unexpected ${method} ${url}`);
      });

      const { result } = renderHook(() => usePreviewAttachment(activeParams));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      await act(async () => {
        await result.current.storeFile(new File(['x'], 'f.pdf', { type: 'application/pdf' }));
      });

      expect(result.current.storeFailed).toBe(true);
      expect(result.current.storedFile).toBe(null);
      expect(result.current.isBusy).toBe(false);
    });

    it('storeBlob POSTs a plain Blob and defaults mimeType to application/pdf', async () => {
      globalThis.fetch = vi.fn(async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'GET') return { ok: true, json: () => Promise.resolve({}) };
        if (method === 'POST') return { ok: true };
        throw new Error(`unexpected ${method} ${url}`);
      });

      const { result } = renderHook(() => usePreviewAttachment(activeParams));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      const blob = new Blob(['raw-bytes']); // no explicit type
      await act(async () => {
        await result.current.storeBlob(blob, 'generated.pdf');
      });

      expect(result.current.storeFailed).toBe(false);
      expect(result.current.storedFile).toEqual({
        fileName: 'generated.pdf',
        mimeType: 'application/pdf',
        objectUrl: 'blob:fake',
      });
    });

    it('storeUrl fetches the source URL, then POSTs and stores it', async () => {
      globalThis.fetch = vi.fn(async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (url.includes('preview-file') && method === 'GET') {
          return { ok: true, json: () => Promise.resolve({}) };
        }
        if (url.includes('preview-file') && method === 'POST') {
          return { ok: true };
        }
        if (url === 'https://files.example.com/source.pdf') {
          return { ok: true, blob: () => Promise.resolve(new Blob(['abc'], { type: 'application/pdf' })) };
        }
        throw new Error(`unexpected ${method} ${url}`);
      });

      const { result } = renderHook(() => usePreviewAttachment(activeParams));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      await act(async () => {
        await result.current.storeUrl('https://files.example.com/source.pdf', 'remote.pdf');
      });

      expect(result.current.storeFailed).toBe(false);
      expect(result.current.storedFile).toEqual({
        fileName: 'remote.pdf',
        mimeType: 'application/pdf',
        objectUrl: 'blob:fake',
      });
    });

    it('storeUrl sets storeFailed when the source fetch itself fails', async () => {
      globalThis.fetch = vi.fn(async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (url.includes('preview-file') && method === 'GET') {
          return { ok: true, json: () => Promise.resolve({}) };
        }
        if (url === 'https://files.example.com/missing.pdf') {
          return { ok: false, status: 404 };
        }
        throw new Error(`unexpected ${method} ${url}`);
      });

      const { result } = renderHook(() => usePreviewAttachment(activeParams));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      await act(async () => {
        await result.current.storeUrl('https://files.example.com/missing.pdf', 'remote.pdf');
      });

      expect(result.current.storeFailed).toBe(true);
      expect(result.current.storedFile).toBe(null);
    });

    it('deleteFile issues a DELETE, revokes the Blob URL and clears storedFile', async () => {
      globalThis.fetch = vi.fn(async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'GET') {
          return {
            ok: true,
            json: () => Promise.resolve({
              fileData: btoa('hello'),
              fileName: 'a.pdf',
              mimeType: 'application/pdf',
            }),
          };
        }
        if (method === 'DELETE') return { ok: true };
        throw new Error(`unexpected ${method} ${url}`);
      });

      const { result } = renderHook(() => usePreviewAttachment(activeParams));
      await waitFor(() => expect(result.current.storedFile).not.toBe(null));

      await act(async () => {
        await result.current.deleteFile();
      });

      expect(result.current.storedFile).toBe(null);
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    });

    it('does not apply a Blob when the server response has no fileData', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ fileName: 'x.pdf' }), // no fileData key
      });

      const { result } = renderHook(() => usePreviewAttachment(activeParams));

      await waitFor(() => expect(result.current.isBusy).toBe(false));
      expect(result.current.storedFile).toBe(null);
    });
  });
});


/**
 * ETP-4855 — the record's document slot is what BOTH side panels render, and
 * holding a slot file is what distinguishes an OCR-captured invoice from one
 * typed by hand. `tableName` additionally mirrors the file into the record's
 * attachments so it also shows in the Attachments tab.
 */
describe('usePreviewAttachment — document slot + attachments mirror', () => {
  const SLOT = {
    documentId: 'inv-1',
    specName: 'purchase-invoice',
    storeCondition: true,
    token: 'tok',
    apiBaseUrl: 'http://host/sws/neo/purchase-invoice',
    tableName: 'C_Invoice',
  };

  const ATTACHMENTS_URL = 'http://host/sws/neo/attachments/C_Invoice/inv-1';

  const pdfSlot = (fileName = 'supplier.pdf') => ({
    fileName, mimeType: 'application/pdf', fileData: btoa('%PDF'),
  });

  /** Route every endpoint the hook can touch; anything else fails loudly. */
  function routeFetch({ slot = null, rows = [] } = {}) {
    globalThis.fetch = vi.fn((url, init = {}) => {
      const u = String(url);
      const method = init.method || 'GET';
      if (u.includes('/preview-file')) {
        if (method === 'GET') return Promise.resolve({ ok: true, json: async () => (slot ?? {}) });
        return Promise.resolve({ ok: true, text: async () => '' });
      }
      if (u.includes('/attachments/file/')) return Promise.resolve({ ok: true, text: async () => '' });
      if (u.includes('/attachments/')) {
        if (method === 'POST') return Promise.resolve({ ok: true, text: async () => '' });
        return Promise.resolve({ ok: true, json: async () => ({ items: rows }) });
      }
      return Promise.reject(new Error(`unexpected fetch: ${method} ${u}`));
    });
  }

  const callsTo = (fragment, method) => globalThis.fetch.mock.calls
    .filter(([url, init]) => String(url).includes(fragment) && (init?.method || 'GET') === method);

  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:slot');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the document held in the slot', async () => {
    routeFetch({ slot: pdfSlot() });

    const { result } = renderHook(() => usePreviewAttachment(SLOT));

    await waitFor(() => expect(result.current.storedFile).not.toBe(null));
    expect(result.current.storedFile).toMatchObject({
      fileName: 'supplier.pdf',
      mimeType: 'application/pdf',
    });
  });

  it('shows nothing when the slot is empty — the manual / historic case', async () => {
    routeFetch({ slot: null, rows: [{ id: 'att-1', name: 'unrelated.pdf' }] });

    const { result } = renderHook(() => usePreviewAttachment(SLOT));

    await waitFor(() => expect(result.current.isBusy).toBe(false));
    // An attachment added through the Attachments tab must NOT surface here.
    expect(result.current.storedFile).toBe(null);
  });

  it('mirrors a stored document into the record attachments and announces it', async () => {
    routeFetch({ slot: null });
    const { result } = renderHook(() => usePreviewAttachment(SLOT));
    await waitFor(() => expect(result.current.isBusy).toBe(false));

    const seen = [];
    const listener = (e) => seen.push(e.detail);
    window.addEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    try {
      await act(async () => {
        await result.current.storeFile(new File(['%PDF'], 'dropped.pdf', { type: 'application/pdf' }));
      });
      await waitFor(() => expect(seen).toHaveLength(1));
    } finally {
      window.removeEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    }

    expect(callsTo('/preview-file', 'POST')).toHaveLength(1);
    const mirror = callsTo('/attachments/C_Invoice/inv-1', 'POST');
    expect(mirror).toHaveLength(1);
    expect(String(mirror[0][0])).toBe(ATTACHMENTS_URL);
    expect(mirror[0][1].body).toBeInstanceOf(FormData);
    expect(result.current.storedFile).toMatchObject({ fileName: 'dropped.pdf' });
  });

  it('does not mirror when no table is declared — a generated-PDF cache', async () => {
    routeFetch({ slot: null });
    const { result } = renderHook(() => usePreviewAttachment({ ...SLOT, tableName: null }));
    await waitFor(() => expect(result.current.isBusy).toBe(false));

    await act(async () => {
      await result.current.storeFile(new File(['%PDF'], 'generated.pdf', { type: 'application/pdf' }));
    });

    expect(callsTo('/preview-file', 'POST')).toHaveLength(1);
    expect(globalThis.fetch.mock.calls.every(([u]) => !String(u).includes('/attachments'))).toBe(true);
  });

  it('still shows the document when only the mirror fails', async () => {
    globalThis.fetch = vi.fn((url, init = {}) => {
      const u = String(url);
      const method = init.method || 'GET';
      if (u.includes('/preview-file')) {
        return method === 'GET'
          ? Promise.resolve({ ok: true, json: async () => ({}) })
          : Promise.resolve({ ok: true, text: async () => '' });
      }
      // The attachments copy is the part that breaks.
      return Promise.resolve({ ok: false, status: 500, text: async () => 'boom' });
    });

    const { result } = renderHook(() => usePreviewAttachment(SLOT));
    await waitFor(() => expect(result.current.isBusy).toBe(false));

    await act(async () => {
      await result.current.storeFile(new File(['%PDF'], 'dropped.pdf', { type: 'application/pdf' }));
    });

    // The slot holds it, which is what both panels render.
    expect(result.current.storedFile).toMatchObject({ fileName: 'dropped.pdf' });
    expect(result.current.storeFailed).toBe(false);
  });

  it('deleting empties the slot and removes the single matching attachment', async () => {
    routeFetch({ slot: pdfSlot('supplier.pdf'), rows: [{ id: 'att-1', name: 'supplier.pdf' }] });
    const { result } = renderHook(() => usePreviewAttachment(SLOT));
    await waitFor(() => expect(result.current.storedFile).not.toBe(null));

    await act(async () => { await result.current.deleteFile(); });

    expect(callsTo('/preview-file', 'DELETE')).toHaveLength(1);
    const removed = callsTo('/attachments/file/', 'DELETE');
    expect(removed).toHaveLength(1);
    expect(String(removed[0][0])).toContain('att-1');
    expect(result.current.storedFile).toBe(null);
  });

  it('leaves the attachments alone when several share the slot file name', async () => {
    routeFetch({
      slot: pdfSlot('supplier.pdf'),
      rows: [{ id: 'att-1', name: 'supplier.pdf' }, { id: 'att-2', name: 'supplier.pdf' }],
    });
    const { result } = renderHook(() => usePreviewAttachment(SLOT));
    await waitFor(() => expect(result.current.storedFile).not.toBe(null));

    await act(async () => { await result.current.deleteFile(); });

    // Ambiguous: guessing which copy to delete would risk the wrong file.
    expect(callsTo('/attachments/file/', 'DELETE')).toHaveLength(0);
    expect(callsTo('/preview-file', 'DELETE')).toHaveLength(1);
    expect(result.current.storedFile).toBe(null);
  });

  it('clears the slot when the file was deleted from the Attachments tab', async () => {
    routeFetch({ slot: pdfSlot('supplier.pdf'), rows: [{ id: 'att-1', name: 'supplier.pdf' }] });
    const { result } = renderHook(() => usePreviewAttachment(SLOT));
    await waitFor(() => expect(result.current.storedFile).not.toBe(null));

    // The tab deleted it: the record no longer holds that file.
    routeFetch({ slot: pdfSlot('supplier.pdf'), rows: [] });
    act(() => {
      notifyAttachmentsChanged({ tableName: 'C_Invoice', recordId: 'inv-1', source: 'the-tab' });
    });

    await waitFor(() => expect(result.current.storedFile).toBe(null));
    expect(callsTo('/preview-file', 'DELETE')).toHaveLength(1);
  });

  it('keeps the slot when the file is still attached', async () => {
    routeFetch({ slot: pdfSlot('supplier.pdf'), rows: [{ id: 'att-1', name: 'supplier.pdf' }] });
    const { result } = renderHook(() => usePreviewAttachment(SLOT));
    await waitFor(() => expect(result.current.storedFile).not.toBe(null));

    act(() => {
      notifyAttachmentsChanged({ tableName: 'C_Invoice', recordId: 'inv-1', source: 'the-tab' });
    });

    await waitFor(() => expect(callsTo('/attachments/C_Invoice/inv-1', 'GET').length).toBeGreaterThan(0));
    expect(result.current.storedFile).toMatchObject({ fileName: 'supplier.pdf' });
    expect(callsTo('/preview-file', 'DELETE')).toHaveLength(0);
  });
});
