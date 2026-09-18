import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFromCachedAttachment } from '../downloadFromCachedAttachment.js';

// ── downloadFromCachedAttachment (ETP-5358 Part 2) ────────────────────────────
//
// Extracted out of OrderPreview.jsx/QuotationPreview.jsx after the same 7-line block
// (cachedAttachment.objectUrl direct download / fetchBlobUrl lazy fetch) was flagged as
// duplicated code by review. Lives in its own dependency-free module — not
// PreviewActionButtons.jsx — since that file pulls in PdfViewer.jsx/pdfjs-dist, and this
// logic has nothing to do with rendering.

describe('downloadFromCachedAttachment', () => {
  let clickMock;
  let createElementSpy;

  beforeEach(() => {
    clickMock = vi.fn();
    createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '', download: '', click: clickMock,
    });
  });

  afterEach(() => {
    createElementSpy.mockRestore();
  });

  it('downloads immediately via objectUrl when already resolved, using the attachment fileName', async () => {
    const cachedAttachment = { objectUrl: 'blob:cached-url', fileName: 'cached.pdf' };
    const handled = await downloadFromCachedAttachment(cachedAttachment, 'fallback.pdf');

    expect(handled).toBe(true);
    const anchor = createElementSpy.mock.results[0].value;
    expect(anchor.href).toBe('blob:cached-url');
    expect(anchor.download).toBe('cached.pdf');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the passed fileName when the attachment carries none', async () => {
    const cachedAttachment = { objectUrl: 'blob:cached-url' };
    await downloadFromCachedAttachment(cachedAttachment, 'fallback.pdf');

    const anchor = createElementSpy.mock.results[0].value;
    expect(anchor.download).toBe('fallback.pdf');
  });

  it('awaits fetchBlobUrl() and downloads its resolved URL when objectUrl is null (autoFetch/skipBlobFetch mode)', async () => {
    const fetchBlobUrl = vi.fn().mockResolvedValue('blob:lazy-url');
    const cachedAttachment = { objectUrl: null, fileName: 'lazy.pdf', fetchBlobUrl };

    const handled = await downloadFromCachedAttachment(cachedAttachment, 'fallback.pdf');

    expect(handled).toBe(true);
    expect(fetchBlobUrl).toHaveBeenCalledTimes(1);
    const anchor = createElementSpy.mock.results[0].value;
    expect(anchor.href).toBe('blob:lazy-url');
    expect(anchor.download).toBe('lazy.pdf');
  });

  it('returns false without touching the DOM when fetchBlobUrl resolves nothing', async () => {
    const fetchBlobUrl = vi.fn().mockResolvedValue(null);
    const cachedAttachment = { objectUrl: null, fetchBlobUrl };

    const handled = await downloadFromCachedAttachment(cachedAttachment, 'fallback.pdf');

    expect(handled).toBe(false);
    expect(createElementSpy).not.toHaveBeenCalled();
  });

  it('returns false for a null cachedAttachment (caller must use its own live-pdfUrl fallback)', async () => {
    const handled = await downloadFromCachedAttachment(null, 'fallback.pdf');

    expect(handled).toBe(false);
    expect(createElementSpy).not.toHaveBeenCalled();
  });

  it('returns false for an attachment with neither objectUrl nor fetchBlobUrl', async () => {
    const handled = await downloadFromCachedAttachment({ fileName: 'x.pdf' }, 'fallback.pdf');

    expect(handled).toBe(false);
    expect(createElementSpy).not.toHaveBeenCalled();
  });
});
