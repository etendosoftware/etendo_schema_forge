// Mock listAttachments BEFORE imports (Vitest hoisting)
vi.mock('@/components/copilot/ocr/listAttachments', () => ({
  fetchMainAttachment: vi.fn(),
  fetchBrandingUpdated: vi.fn(),
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
  fetchBrandingUpdated,
  fetchAttachmentBlobUrl,
  uploadAndMarkMainAttachment,
  markAttachmentAsMain,
  deleteAttachment,
} from '@/components/copilot/ocr/listAttachments';
import { notifyAttachmentsChanged, ATTACHMENTS_CHANGED_EVENT } from '@/components/attachments/attachmentsBus';
import { useMainAttachment } from '../useMainAttachment.js';

const BASE_PARAMS = {
  documentId: 'inv-1',
  tableName: 'C_Invoice',
  storeCondition: true,
  token: 'test-token',
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
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test-url');
    globalThis.URL.revokeObjectURL = vi.fn();
    globalThis.fetch = vi.fn();
    // ETP-5541 — branding unknown by default (fail-open): never invalidates.
    fetchBrandingUpdated.mockResolvedValue(null);
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
        token: 'test-token', tableName: 'C_Invoice', recordId: 'inv-1', apiBaseUrl: '/sws/neo/purchase-invoice',
      });
      expect(fetchAttachmentBlobUrl).toHaveBeenCalledWith({
        token: 'test-token', attachmentId: 'att-1', apiBaseUrl: '/sws/neo/purchase-invoice',
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

  // ── Staleness (ETP-4787) ────────────────────────────────────────────────────

  // The hook keeps showing a stale file (blanking the panel mid-refresh would be worse)
  // but flags it, so ManagedLeftPanel overwrites it with the freshly rendered PDF
  // instead of skipping the auto-store because "a file already exists".
  describe('storedFileIsStale', () => {
    it('flags an attachment uploaded before the record\'s last edit', async () => {
      fetchMainAttachment.mockResolvedValue({ ...MAIN_ATTACHMENT, uploadedAt: '2026-08-24T10:00:00Z' });
      fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');

      const { result } = renderHook(() =>
        useMainAttachment({ ...BASE_PARAMS, recordUpdated: '2026-08-24T12:15:30+02:00' }),
      );

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      expect(result.current.storedFileIsStale).toBe(true);
      expect(result.current.storedFile).not.toBeNull();
    });

    it('does not flag an attachment newer than the record', async () => {
      fetchMainAttachment.mockResolvedValue({ ...MAIN_ATTACHMENT, uploadedAt: '2026-08-24T11:00:00Z' });
      fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');

      const { result } = renderHook(() =>
        useMainAttachment({ ...BASE_PARAMS, recordUpdated: '2026-08-24T12:15:30+02:00' }),
      );

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      // ETP-5541 — the session is asked for brandingUpdated; null (unknown) is fail-open.
      expect(fetchBrandingUpdated).toHaveBeenCalledWith({
        token: 'test-token', apiBaseUrl: '/sws/neo/purchase-invoice',
      });
      expect(result.current.storedFileIsStale).toBe(false);
    });

    it('flags an attachment written before the company branding last changed (ETP-5541)', async () => {
      fetchMainAttachment.mockResolvedValue({ ...MAIN_ATTACHMENT, uploadedAt: '2026-08-24T11:00:00Z' });
      fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');
      fetchBrandingUpdated.mockResolvedValue('2026-08-24T11:00:01Z');

      const { result } = renderHook(() =>
        useMainAttachment({ ...BASE_PARAMS, recordUpdated: '2026-08-24T12:15:30+02:00' }),
      );

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      expect(result.current.storedFileIsStale).toBe(true);
    });

    it('never flags anything when the caller passes no recordUpdated', async () => {
      fetchMainAttachment.mockResolvedValue({ ...MAIN_ATTACHMENT, uploadedAt: '2001-01-01T00:00:00Z' });
      fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');

      const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      // ETP-5541 — an opted-out window can never be invalidated, so no /session round trip.
      expect(fetchBrandingUpdated).not.toHaveBeenCalled();
      expect(result.current.storedFileIsStale).toBe(false);
    });

    it('clears the flag once a fresh file replaces the stale one', async () => {
      fetchMainAttachment.mockResolvedValue({ ...MAIN_ATTACHMENT, uploadedAt: '2026-08-24T10:00:00Z' });
      fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');
      uploadAndMarkMainAttachment.mockResolvedValue({ id: 'att-2' });

      const { result } = renderHook(() =>
        useMainAttachment({ ...BASE_PARAMS, recordUpdated: '2026-08-24T12:15:30+02:00' }),
      );
      await waitFor(() => expect(result.current.storedFileIsStale).toBe(true));

      await act(async () => {
        await result.current.storeBlob(new Blob(['%PDF-fresh']), 'fresh.pdf');
      });

      // uploadAndMarkMainAttachment deletes the previously marked file server-side, so
      // the record's cache IS this blob — the loop terminates instead of re-rendering
      // on every subsequent open.
      expect(result.current.storedFileIsStale).toBe(false);
      expect(result.current.storedFile.attachmentId).toBe('att-2');
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

    // ETP-4576: inverted on purpose. A null token is the normal cookie-session state, so
    // it must NOT suppress the lookup - the `__Host-` cookie is the credential. Gating on
    // it would leave every record showing no attachment at all, with no error to explain it.
    it('still looks the attachment up when no token is held', async () => {
      renderHook(() => useMainAttachment({ ...BASE_PARAMS, token: null }));
      await act(async () => { await Promise.resolve(); });
      expect(fetchMainAttachment).toHaveBeenCalledTimes(1);
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
        token: 'test-token', tableName: 'C_Invoice', recordId: 'inv-1',
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
        token: 'test-token', tableName: 'C_Invoice', recordId: 'inv-1',
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

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/f.pdf',
        {
          credentials: 'include', signal: expect.any(AbortSignal),
          headers: { Authorization: 'Bearer test-token', 'Accept-Language': 'es_ES' },
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
        token: 'test-token', attachmentId: 'att-5', isMain: true, apiBaseUrl: '/sws/neo/purchase-invoice',
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
        token: 'test-token', attachmentId: 'att-1', apiBaseUrl: '/sws/neo/purchase-invoice',
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

  // ── skipBlobFetch / fetchBlobUrl (ETP-5358 Part 2) ──────────────────────────
  //
  // GenericPreviewModal's ManagedLeftPanel passes skipBlobFetch: true when autoFetch is true
  // (see ETP-5358 Part 1): nothing renders this hook's own file view in that mode, so eagerly
  // downloading the blob on every mount was pure waste — it duplicated the same GET already
  // made by the caller's own usePdfGenerator-backed viewer. This mode keeps the mount fetch to
  // metadata only, and fetchBlobUrl() resolves the bytes lazily, on demand.

  describe('skipBlobFetch (ETP-5358 Part 2)', () => {
    it('on mount, fetches only metadata — never the blob — and reports storedFile with objectUrl: null', async () => {
      fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);

      const { result } = renderHook(() =>
        useMainAttachment({ ...BASE_PARAMS, skipBlobFetch: true }),
      );

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      expect(fetchMainAttachment).toHaveBeenCalledTimes(1);
      expect(fetchAttachmentBlobUrl).not.toHaveBeenCalled();
      expect(result.current.storedFile).toEqual({
        attachmentId: 'att-1', fileName: 'supplier.pdf', mimeType: 'application/pdf', objectUrl: null,
      });
    });

    it('still computes storedFileIsStale in metadata-only mode (staleness never needed the blob)', async () => {
      fetchMainAttachment.mockResolvedValue({ ...MAIN_ATTACHMENT, uploadedAt: '2026-08-24T10:00:00Z' });

      const { result } = renderHook(() =>
        useMainAttachment({ ...BASE_PARAMS, skipBlobFetch: true, recordUpdated: '2026-08-24T12:15:30+02:00' }),
      );

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      expect(result.current.storedFileIsStale).toBe(true);
      expect(fetchAttachmentBlobUrl).not.toHaveBeenCalled();
    });

    it('leaves storedFile null when no attachment is marked, same as eager mode', async () => {
      fetchMainAttachment.mockResolvedValue(null);

      const { result } = renderHook(() =>
        useMainAttachment({ ...BASE_PARAMS, skipBlobFetch: true }),
      );

      await waitFor(() => expect(result.current.isBusy).toBe(false));

      expect(result.current.storedFile).toBeNull();
      expect(fetchAttachmentBlobUrl).not.toHaveBeenCalled();
    });

    describe('fetchBlobUrl', () => {
      it('resolves the blob lazily on first call and updates storedFile.objectUrl', async () => {
        fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);
        fetchAttachmentBlobUrl.mockResolvedValue('blob:lazy-url');

        const { result } = renderHook(() =>
          useMainAttachment({ ...BASE_PARAMS, skipBlobFetch: true }),
        );
        await waitFor(() => expect(result.current.storedFile).not.toBeNull());
        expect(result.current.storedFile.objectUrl).toBeNull();

        let url;
        await act(async () => { url = await result.current.fetchBlobUrl(); });

        expect(url).toBe('blob:lazy-url');
        expect(fetchAttachmentBlobUrl).toHaveBeenCalledWith({
          token: 'test-token', attachmentId: 'att-1', apiBaseUrl: '/sws/neo/purchase-invoice',
        });
        expect(result.current.storedFile.objectUrl).toBe('blob:lazy-url');
      });

      it('returns the already-resolved URL on a second call, without a second network request', async () => {
        fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);
        fetchAttachmentBlobUrl.mockResolvedValue('blob:lazy-url');

        const { result } = renderHook(() =>
          useMainAttachment({ ...BASE_PARAMS, skipBlobFetch: true }),
        );
        await waitFor(() => expect(result.current.storedFile).not.toBeNull());

        await act(async () => { await result.current.fetchBlobUrl(); });
        expect(fetchAttachmentBlobUrl).toHaveBeenCalledTimes(1);

        let secondUrl;
        await act(async () => { secondUrl = await result.current.fetchBlobUrl(); });

        expect(secondUrl).toBe('blob:lazy-url');
        expect(fetchAttachmentBlobUrl).toHaveBeenCalledTimes(1);
      });

      it('de-dupes a concurrent double-call onto a single in-flight request (e.g. an impatient double-click)', async () => {
        fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);
        let resolveBlob;
        fetchAttachmentBlobUrl.mockReturnValue(new Promise((resolve) => { resolveBlob = resolve; }));

        const { result } = renderHook(() =>
          useMainAttachment({ ...BASE_PARAMS, skipBlobFetch: true }),
        );
        await waitFor(() => expect(result.current.storedFile).not.toBeNull());

        let firstCall;
        let secondCall;
        act(() => {
          firstCall = result.current.fetchBlobUrl();
          secondCall = result.current.fetchBlobUrl();
        });

        expect(fetchAttachmentBlobUrl).toHaveBeenCalledTimes(1);

        await act(async () => { resolveBlob('blob:concurrent-url'); await Promise.all([firstCall, secondCall]); });

        expect(await firstCall).toBe('blob:concurrent-url');
        expect(await secondCall).toBe('blob:concurrent-url');
        expect(fetchAttachmentBlobUrl).toHaveBeenCalledTimes(1);
      });

      it('returns null and leaves storedFile untouched when there is no marked attachment to fetch', async () => {
        fetchMainAttachment.mockResolvedValue(null);

        const { result } = renderHook(() =>
          useMainAttachment({ ...BASE_PARAMS, skipBlobFetch: true }),
        );
        await waitFor(() => expect(result.current.isBusy).toBe(false));

        let url;
        await act(async () => { url = await result.current.fetchBlobUrl(); });

        expect(url).toBeNull();
        expect(fetchAttachmentBlobUrl).not.toHaveBeenCalled();
        expect(result.current.storedFile).toBeNull();
      });

      it('returns null (does not throw) when the underlying request fails', async () => {
        fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);
        fetchAttachmentBlobUrl.mockRejectedValue(new Error('network error'));

        const { result } = renderHook(() =>
          useMainAttachment({ ...BASE_PARAMS, skipBlobFetch: true }),
        );
        await waitFor(() => expect(result.current.storedFile).not.toBeNull());

        let url;
        await act(async () => { url = await result.current.fetchBlobUrl(); });

        expect(url).toBeNull();
        expect(result.current.storedFile.objectUrl).toBeNull();
      });

      it('in eager mode (skipBlobFetch not set), returns the already-fetched URL without an extra request', async () => {
        fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);
        fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');

        const { result } = renderHook(() => useMainAttachment(BASE_PARAMS));
        await waitFor(() => expect(result.current.storedFile?.objectUrl).toBe('blob:main-url'));
        expect(fetchAttachmentBlobUrl).toHaveBeenCalledTimes(1);

        let url;
        await act(async () => { url = await result.current.fetchBlobUrl(); });

        expect(url).toBe('blob:main-url');
        expect(fetchAttachmentBlobUrl).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ── deleteFile while in flight (ETP-5518 W1) ────────────────────────────────
  //
  // A DELETE keeps the hook busy for its whole duration (so Replace / Delete stay disabled
  // everywhere), `isBusy` is driven by a counter of pending operations, and a DELETE that
  // lands after a newer file was stored clears nothing.

  describe('deleteFile in flight (ETP-5518)', () => {
    function deferred() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    }

    async function mountWithStoredFile() {
      fetchMainAttachment.mockResolvedValue(MAIN_ATTACHMENT);
      fetchAttachmentBlobUrl.mockResolvedValue('blob:main-url');
      const hook = renderHook(() => useMainAttachment(BASE_PARAMS));
      await waitFor(() => expect(hook.result.current.storedFile?.attachmentId).toBe('att-1'));
      await waitFor(() => expect(hook.result.current.isBusy).toBe(false));
      return hook;
    }

    function startDelete(result) {
      let pending;
      act(() => { pending = result.current.deleteFile(); });
      return pending;
    }

    it('is busy from the moment the DELETE starts until it settles', async () => {
      const del = deferred();
      deleteAttachment.mockReturnValue(del.promise);
      const { result } = await mountWithStoredFile();

      const pending = startDelete(result);

      expect(result.current.isBusy).toBe(true);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(result.current.isBusy).toBe(true);
      expect(result.current.storedFile.attachmentId).toBe('att-1');

      await act(async () => { del.resolve({ ok: true }); await pending; });

      expect(result.current.isBusy).toBe(false);
      expect(result.current.storedFile).toBeNull();
    });

    it('a rejected DELETE ends the busy state and propagates the error to the caller', async () => {
      const del = deferred();
      deleteAttachment.mockReturnValue(del.promise);
      const { result } = await mountWithStoredFile();

      const pending = startDelete(result);
      const outcome = pending.then(() => 'resolved', (err) => err);
      expect(result.current.isBusy).toBe(true);

      await act(async () => { del.reject(new Error('delete exploded')); await outcome; });

      const err = await outcome;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('delete exploded');
      expect(result.current.isBusy).toBe(false);
      expect(result.current.storedFile.attachmentId).toBe('att-1');
      expect(notifyAttachmentsChanged).not.toHaveBeenCalled();
    });

    it('a non-ok DELETE ends the busy state silently and keeps the file', async () => {
      const del = deferred();
      deleteAttachment.mockReturnValue(del.promise);
      const { result } = await mountWithStoredFile();

      const pending = startDelete(result);
      expect(result.current.isBusy).toBe(true);

      await act(async () => { del.resolve({ ok: false, error: 'server_error' }); await pending; });

      expect(result.current.isBusy).toBe(false);
      expect(result.current.storedFile.attachmentId).toBe('att-1');
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('with nothing interleaved, an ok DELETE clears the file and revokes its object URL', async () => {
      deleteAttachment.mockResolvedValue({ ok: true });
      const { result } = await mountWithStoredFile();

      await act(async () => { await result.current.deleteFile(); });

      expect(result.current.storedFile).toBeNull();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:main-url');
      expect(notifyAttachmentsChanged).toHaveBeenCalledTimes(1);
    });

    it('a DELETE that lands after a newer file was stored keeps the newer file and its URL', async () => {
      const del = deferred();
      deleteAttachment.mockReturnValue(del.promise);
      uploadAndMarkMainAttachment.mockResolvedValue({ id: 'att-B' });
      URL.createObjectURL.mockReturnValue('blob:B-url');
      const { result } = await mountWithStoredFile();

      const pending = startDelete(result);
      const newFile = new File(['%PDF-B'], 'b.pdf', { type: 'application/pdf' });
      await act(async () => { await result.current.storeFile(newFile); });
      expect(result.current.storedFile.attachmentId).toBe('att-B');
      notifyAttachmentsChanged.mockClear();
      URL.revokeObjectURL.mockClear();

      await act(async () => { del.resolve({ ok: true }); await pending; });

      expect(deleteAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: 'att-1' }));
      expect(result.current.storedFile).toEqual({
        attachmentId: 'att-B', fileName: 'b.pdf', mimeType: 'application/pdf', objectUrl: 'blob:B-url',
      });
      expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:B-url');
      expect(notifyAttachmentsChanged).toHaveBeenCalledTimes(1);
      expect(notifyAttachmentsChanged).toHaveBeenCalledWith({
        tableName: 'C_Invoice', recordId: 'inv-1', source: expect.any(String),
      });
      expect(result.current.isBusy).toBe(false);
    });

    it('stays busy while a DELETE is pending even after an overlapping store finishes first', async () => {
      const del = deferred();
      deleteAttachment.mockReturnValue(del.promise);
      uploadAndMarkMainAttachment.mockResolvedValue({ id: 'att-B' });
      const { result } = await mountWithStoredFile();

      const pending = startDelete(result);
      await act(async () => {
        await result.current.storeFile(new File(['%PDF-B'], 'b.pdf', { type: 'application/pdf' }));
      });

      expect(result.current.isBusy).toBe(true);

      await act(async () => { del.resolve({ ok: true }); await pending; });
      expect(result.current.isBusy).toBe(false);
    });

    it('stays busy while a store is pending even after an overlapping DELETE finishes first', async () => {
      const del = deferred();
      const upload = deferred();
      deleteAttachment.mockReturnValue(del.promise);
      uploadAndMarkMainAttachment.mockReturnValue(upload.promise);
      const { result } = await mountWithStoredFile();

      const pendingDelete = startDelete(result);
      let pendingStore;
      act(() => {
        pendingStore = result.current.storeFile(new File(['%PDF-B'], 'b.pdf', { type: 'application/pdf' }));
      });

      await act(async () => { del.resolve({ ok: true }); await pendingDelete; });
      expect(result.current.isBusy).toBe(true);

      await act(async () => { upload.resolve({ id: 'att-B' }); await pendingStore; });
      expect(result.current.isBusy).toBe(false);
      expect(result.current.storedFile.attachmentId).toBe('att-B');
    });

    it('stays busy while a DELETE is pending even after a cross-view refresh finishes first', async () => {
      const del = deferred();
      deleteAttachment.mockReturnValue(del.promise);
      const { result } = await mountWithStoredFile();

      const pending = startDelete(result);
      dispatchAttachmentsChanged({ tableName: 'C_Invoice', recordId: 'inv-1', source: 'some-other-view' });
      await waitFor(() => expect(fetchMainAttachment).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(fetchAttachmentBlobUrl).toHaveBeenCalledTimes(2));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      expect(result.current.isBusy).toBe(true);

      await act(async () => { del.resolve({ ok: true }); await pending; });
      expect(result.current.isBusy).toBe(false);
    });
  });

});
