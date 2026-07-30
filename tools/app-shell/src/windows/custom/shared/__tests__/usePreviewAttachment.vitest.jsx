// --- Mocks ---

// --- Import under test ---

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePreviewAttachment, ACCEPTED_TYPES, ACCEPT_ATTR } from '../usePreviewAttachment.js';

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
