/**
 * ETP-5358 Part 2 — shared by OrderPreview.jsx and QuotationPreview.jsx. Both used to carry
 * an identical block handling `cachedAttachment.objectUrl` (already-resolved direct download)
 * and `cachedAttachment.fetchBlobUrl` (lazy, on-demand fetch — see useMainAttachment's
 * `skipBlobFetch`), flagged as duplicated code by review. Extracted here — as its own
 * dependency-free module rather than folded into PreviewActionButtons.jsx, since that file
 * pulls in PdfViewer.jsx/pdfjs-dist (which needs a DOMMatrix global unavailable under plain
 * jsdom), and this logic has nothing to do with rendering.
 */

function triggerAnchorDownload(href, download) {
  const a = document.createElement('a');
  a.href = href;
  a.download = download;
  a.click();
}

/**
 * @param {{objectUrl?: string|null, fileName?: string, fetchBlobUrl?: () => Promise<string|null>}|null} cachedAttachment
 * @param {string} fileName - fallback download name when the attachment carries none
 * @returns {Promise<boolean>} true if the download was handled from the cached attachment
 *   (immediately or via a lazy fetch); false means the caller must fall back to its own
 *   live-rendered PDF.
 */
export async function downloadFromCachedAttachment(cachedAttachment, fileName) {
  if (cachedAttachment?.objectUrl) {
    triggerAnchorDownload(cachedAttachment.objectUrl, cachedAttachment.fileName || fileName);
    return true;
  }
  if (cachedAttachment?.fetchBlobUrl) {
    const url = await cachedAttachment.fetchBlobUrl();
    if (url) {
      triggerAnchorDownload(url, cachedAttachment.fileName || fileName);
      return true;
    }
  }
  return false;
}
