// Mock listAttachments BEFORE imports (Vitest hoisting)
vi.mock('@/components/copilot/ocr/listAttachments', () => ({
  fetchMainAttachment: vi.fn(),
  fetchAttachmentBlobUrl: vi.fn(),
  uploadAndMarkMainAttachment: vi.fn(),
  markAttachmentAsMain: vi.fn(),
  deleteAttachment: vi.fn(),
}));

// The cross-view invalidation bus (ETP-4855) is used for real: notifyAttachmentsChanged
// is spied but still dispatches the real `window` CustomEvent, and useAttachmentsChanged
// is the real subscriber. This exercises the actual pub/sub wiring instead of a mock of it.
vi.mock('@/components/attachments/attachmentsBus', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    notifyAttachmentsChanged: vi.fn(actual.notifyAttachmentsChanged),
  };
});

import { renderHook, act, waitFor } from '@testing-library/react';
import {
  fetchMainAttachment,
  fetchAttachmentBlobUrl,
  uploadAndMarkMainAttachment,
  markAttachmentAsMain,
  deleteAttachment,
} from '@/components/copilot/ocr/listAttachments';
import { TEST_BEARER_TOKEN, declareBearerSession } from '@/test/sessionContract.js';
import { notifyAttachmentsChanged, ATTACHMENTS_CHANGED_EVENT } from '@/components/attachments/attachmentsBus';
import { useMainAttachment } from '../useMainAttachment.js';

const BASE_PARAMS = {
  documentId: 'inv-1',
  tableName: 'C_Invoice',
  storeCondition: true,
  apiBaseUrl: '/sws/neo/purchase-invoice',
};

const MAIN_ATTACHMENT = { id: 'att-1', name: 'supplier.pdf', dataType: 'application/pdf' };

function dispatchAttachmentsChanged(detail) {
  act(() => {
    window.dispatchEvent(new CustomEvent(ATTACHMENTS_CHANGED_EVENT, { detail }));
  });
}

describe('useMainAttachment', () => {
  beforeEach(() => {
    declareBearerSession();
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test-url');
    globalThis.URL.revokeObjectURL = vi.fn();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Mount / restore from server ─────────────────────────────────────────────

  describe('on mount', () => {
    it('fetches the marked attachment and its blob when one exists', async () => {
      fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);
      fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      expect(fetchMainAttachment).toHaveBeenCalledWith({
        tableName: 'C_Invoice', recordId: 'inv-1', apiBaseUrl: '/sws/neo/purchase-invoice',
      });
      expect(fetchAttachmentBlobUrl).toHaveBeenCalledWith({
        attachmentId: 'att-1', apiBaseUrl: '/sws/neo/purchase-invoice',
      });
      expect(result.current.storedFile).toEqual({
        attachmentId: 'att-1', fileName: 'supplier.pdf', mimeType: 'application/pdf', objectUrl: 'blob:main-url',
      });
    });

    it('leaves storedFile null when no attachment is marked', async () => {
      fetchMainAttachment.mockResolvedValue(null);

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      expect(result.current.storedFile).toBeNull();
      expect(fetchAttachmentBlobUrl).not.toHaveBeenCalled();
    });

    it('does not crash and keeps storedFile null when the fetch throws', async () => {
      fetchMainAttachment.mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      expect(result.current.storedFile).toBeNull();
    });
  });

  // ── No-op guard ──────────────────────────────────────────────────────────────

  describe('when inactive', () => {
    it('is a no-op when storeCondition is false', async () => {
      const { result } = renderHook(() =>
        useMainAttachment({ ...BASE_PARAMS, storeCondition: false }),
      );

      await act(async () => { await Promise.resolve(); });

      expect(fetchMainAttachment).not.toHaveBeenCalled();
      expect(result.current.storedFile).toBeNull();
      expect(result.current.isBusy).toBe(false);
    });

    it('is a no-op when documentId is missing', async () => {
      renderHook(() => useMainAttachment({ ...BASE_PARAMS, documentId: null }));
      await act(async () => { await Promise.resolve(); });
      expect(fetchMainAttachment).not.toHaveBeenCalled();
    });

    it('is a no-op when tableName is missing', async () => {
      renderHook(() => useMainAttachment({ ...BASE_PARAMS, tableName: null }));
      await act(async () => { await Promise.resolve(); });
      expect(fetchMainAttachment).not.toHaveBeenCalled();
    });

    // ETP-4576 removed the `token` half of the hook's `active` condition: it is
    // structurally undefined under a cookie session, so keeping it made the whole
    // hook inert — nothing loaded, uploaded or got marked, silently.
    it('is a no-op when tableName is missing', async () => {
      renderHook(() => useMainAttachment({ ...BASE_PARAMS, tableName: null }));
      await act(async () => { await Promise.resolve(); });
      expect(fetchMainAttachment).not.toHaveBeenCalled();
    });

    it('storeFile is a no-op when inactive', async () => {
      const { result } = renderHook(() =>
        useMainAttachment({ ...BASE_PARAMS, storeCondition: false }),
      );

      await act(async () => { await result.current.storeFile(new File(['x'], 'x.pdf')); });

      expect(uploadAndMarkMainAttachment).not.toHaveBeenCalled();
      expect(notifyAttachmentsChanged).not.toHaveBeenCalled();
    });
  });

  // ── storeFile / storeBlob / storeUrl ────────────────────────────────────────

  describe('storeFile', () => {
    beforeEach(() => {
      fetchMainAttachment.mockResolvedValue(null);
    });

    it('uploads, marks, applies the new attachment and notifies other views', async () => {
      uploadAndMarkMainAttachment.mockResolvedValue({ id: 'att-2' });
      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      const file = new File(['%PDF'], 'invoice.pdf', { type: 'application/pdf' });
      await act(async () => { await result.current.storeFile(file); });

      expect(uploadAndMarkMainAttachment).toHaveBeenCalledWith({
        tableName: 'C_Invoice', recordId: 'inv-1',
        file, fileName: 'invoice.pdf', apiBaseUrl: '/sws/neo/purchase-invoice',
      });
      expect(result.current.storedFile).toEqual({
        attachmentId: 'att-2', fileName: 'invoice.pdf', mimeType: 'application/pdf', objectUrl: 'blob:test-url',
      });
      expect(result.current.storeFailed).toBe(false);
      expect(notifyAttachmentsChanged).toHaveBeenCalledWith({
        tableName: 'C_Invoice', recordId: 'inv-1', source: expect.any(String),
      });
    });

    it('sets storeFailed and skips notify when the upload fails', async () => {
      uploadAndMarkMainAttachment.mockResolvedValue(null);
      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      const file = new File(['%PDF'], 'invoice.pdf', { type: 'application/pdf' });
      await act(async () => { await result.current.storeFile(file); });

      expect(result.current.storeFailed).toBe(true);
      expect(result.current.storedFile).toBeNull();
      expect(notifyAttachmentsChanged).not.toHaveBeenCalled();
    });
  });

  describe('storeBlob', () => {
    beforeEach(() => {
      fetchMainAttachment.mockResolvedValue(null);
    });

    it('uploads a blob under the given fileName and notifies other views', async () => {
      uploadAndMarkMainAttachment.mockResolvedValue({ id: 'att-3' });
      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      const blob = new Blob(['%PDF'], { type: 'application/pdf' });
      await act(async () => { await result.current.storeBlob(blob, 'from-ocr.pdf'); });

      expect(uploadAndMarkMainAttachment).toHaveBeenCalledWith({
        tableName: 'C_Invoice', recordId: 'inv-1',
        file: blob, fileName: 'from-ocr.pdf', apiBaseUrl: '/sws/neo/purchase-invoice',
      });
      expect(result.current.storedFile.attachmentId).toBe('att-3');
      expect(notifyAttachmentsChanged).toHaveBeenCalledWith({
        tableName: 'C_Invoice', recordId: 'inv-1', source: expect.any(String),
      });
    });
  });

  describe('storeUrl', () => {
    beforeEach(() => {
      fetchMainAttachment.mockResolvedValue(null);
    });

    it('fetches the URL as a blob, uploads it and notifies other views', async () => {
      const blob = new Blob(['%PDF'], { type: 'application/pdf' });
      globalThis.fetch.mockResolvedValue({ ok: true, blob: async () => blob });
      uploadAndMarkMainAttachment.mockResolvedValue({ id: 'att-4' });

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      await act(async () => { await result.current.storeUrl('https://example.com/f.pdf', 'remote.pdf'); });

      // A bodyless GET, so no Content-Type is declared — only the credential the
      // active scheme supplies, plus the cookie opt-in for cross-origin.
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/f.pdf',
        {
          headers: { Authorization: `Bearer ${TEST_BEARER_TOKEN}` },
          credentials: 'include',
        },
      );
      expect(uploadAndMarkMainAttachment).toHaveBeenCalledWith(expect.objectContaining({
        fileName: 'remote.pdf',
      }));
      expect(result.current.storedFile.attachmentId).toBe('att-4');
      expect(notifyAttachmentsChanged).toHaveBeenCalled();
    });

    it('sets storeFailed and skips notify when the remote fetch fails', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      await act(async () => { await result.current.storeUrl('https://example.com/missing.pdf', 'missing.pdf'); });

      expect(result.current.storeFailed).toBe(true);
      expect(uploadAndMarkMainAttachment).not.toHaveBeenCalled();
      expect(notifyAttachmentsChanged).not.toHaveBeenCalled();
    });
  });

  // ── markExisting ─────────────────────────────────────────────────────────────

  describe('markExisting', () => {
    beforeEach(() => {
      fetchMainAttachment.mockResolvedValue(null);
    });

    it('marks the attachment as main, loads it into view and notifies other views', async () => {
      markAttachmentAsMain.mockResolvedValue(true);
      fetchAttachmentBlobUrl.mockResolvedValue('blob:existing-url');

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      let returned;
      await act(async () => {
        returned = await result.current.markExisting('att-5', 'ocr-source.pdf', 'application/pdf');
      });

      expect(markAttachmentAsMain).toHaveBeenCalledWith({
        attachmentId: 'att-5', isMain: true, apiBaseUrl: '/sws/neo/purchase-invoice',
      });
      expect(returned).toBe(true);
      expect(result.current.storedFile).toEqual({
        attachmentId: 'att-5', fileName: 'ocr-source.pdf', mimeType: 'application/pdf', objectUrl: 'blob:existing-url',
      });
      expect(notifyAttachmentsChanged).toHaveBeenCalledWith({
        tableName: 'C_Invoice', recordId: 'inv-1', source: expect.any(String),
      });
    });

    it('returns false and skips notify when marking fails', async () => {
      markAttachmentAsMain.mockResolvedValue(false);

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      let returned;
      await act(async () => {
        returned = await result.current.markExisting('att-5', 'ocr-source.pdf', 'application/pdf');
      });

      expect(returned).toBe(false);
      expect(result.current.storedFile).toBeNull();
      expect(notifyAttachmentsChanged).not.toHaveBeenCalled();
    });
  });

  // ── deleteFile ───────────────────────────────────────────────────────────────

  describe('deleteFile', () => {
    it('deletes, clears storedFile and notifies other views on success', async () => {
      fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);
      fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');
      deleteAttachment.mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.storedFile).not.toBeNull());

      await act(async () => { await result.current.deleteFile(); });

      expect(deleteAttachment).toHaveBeenCalledWith({
        attachmentId: 'att-1', apiBaseUrl: '/sws/neo/purchase-invoice',
      });
      expect(result.current.storedFile).toBeNull();
      expect(notifyAttachmentsChanged).toHaveBeenCalledWith({
        tableName: 'C_Invoice', recordId: 'inv-1', source: expect.any(String),
      });
    });

    it('leaves storedFile untouched and skips notify when the delete fails', async () => {
      fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);
      fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');
      deleteAttachment.mockResolvedValue({ ok: false, error: 'server_error' });

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.storedFile).not.toBeNull());

      await act(async () => { await result.current.deleteFile(); });

      expect(result.current.storedFile).not.toBeNull();
      expect(result.current.storedFile.attachmentId).toBe('att-1');
      expect(notifyAttachmentsChanged).not.toHaveBeenCalled();
    });

    it('is a no-op when there is nothing stored', async () => {
      fetchMainAttachment.mockResolvedValue(null);
      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      await act(async () => { await result.current.deleteFile(); });

      expect(deleteAttachment).not.toHaveBeenCalled();
    });
  });

  // ── Cross-view invalidation (ETP-4855) ──────────────────────────────────────

  describe('cross-view invalidation', () => {
    it('re-fetches when another view announces a change to the same (tableName, recordId)', async () => {
      fetchMainAttachment.mockResolvedValue(null);
      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      expect(fetchMainAttachment).toHaveBeenCalledTimes(1);

      dispatchAttachmentsChanged({ tableName: 'C_Invoice', recordId: 'inv-1', source: 'some-other-view' });

      await waitFor(() => expect(fetchMainAttachment).toHaveBeenCalledTimes(2));
    });

    it('ignores a change announced for a different table', async () => {
      fetchMainAttachment.mockResolvedValue(null);
      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      dispatchAttachmentsChanged({ tableName: 'M_InOut', recordId: 'inv-1', source: 'some-other-view' });

      await act(async () => { await Promise.resolve(); });
      expect(fetchMainAttachment).toHaveBeenCalledTimes(1);
    });

    it('ignores a change announced for a different record', async () => {
      fetchMainAttachment.mockResolvedValue(null);
      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));

      dispatchAttachmentsChanged({ tableName: 'C_Invoice', recordId: 'inv-999', source: 'some-other-view' });

      await act(async () => { await Promise.resolve(); });
      expect(fetchMainAttachment).toHaveBeenCalledTimes(1);
    });

    it('does not re-fetch on its own write (own notify is ignored by its own subscription)', async () => {
      fetchMainAttachment.mockResolvedValue(null);
      uploadAndMarkMainAttachment.mockResolvedValue({ id: 'att-9' });

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(result.current.isBusy).toBe(false));
      expect(fetchMainAttachment).toHaveBeenCalledTimes(1);

      const file = new File(['%PDF'], 'invoice.pdf', { type: 'application/pdf' });
      await act(async () => { await result.current.storeFile(file); });

      // notifyAttachmentsChanged fired a real event carrying this instance's own
      // source id; useAttachmentsChanged must have filtered it out.
      expect(notifyAttachmentsChanged).toHaveBeenCalledTimes(1);
      expect(fetchMainAttachment).toHaveBeenCalledTimes(1);
    });
  });
});
