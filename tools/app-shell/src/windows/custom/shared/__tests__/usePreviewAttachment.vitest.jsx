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
});
