import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useMainAttachment } from '@/windows/custom/shared/useMainAttachment.js';
import {
  initialZoom, PAPER_WIDTH, stepZoom, ZOOM_MAX, ZOOM_MIN,
} from './invoiceInboxReviewModel.js';

const LazyPdfViewer = lazy(() => import('@/windows/custom/shared/PdfViewer.jsx'));

/** AD table name of `ETGO_INCOMING_DOCUMENT`, as `/sws/neo/attachments/{table}/{id}/main` takes it. */
export const INCOMING_DOCUMENT_TABLE = 'ETGO_Incoming_Document';

/** Gaps around the document: 8 above, 24 at the sides, 40 below (the design's). */
const CONTENT_PADDING = Object.freeze({ top: 8, right: 24, bottom: 40, left: 24 });
const SIDE_GAPS = CONTENT_PADDING.left + CONTENT_PADDING.right;
const NO_OP = () => {};

function Centered({ testId, children }) {
  return (
    <div
      className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-muted-foreground"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function ToolbarButton({ label, onClick, disabled, testId, children }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-[30px] w-[30px] flex-none"
      data-testid={testId}>
      {children}
    </Button>
  );
}

/**
 * The document zoom, in percent (40-160, step 15), TRUTHFUL: 100 % is a fixed A4 sheet of 595px,
 * so the page renders `595 * zoom / 100` px wide whatever the pane width. It starts at 100, or at
 * the value that fits a pane narrower than a sheet (`initialZoom`, measured once per document).
 * The pane's inner width (without its side gaps) is tracked with a ResizeObserver; the shared
 * `PdfViewer` takes a scale relative to that width, so it gets `scale = (595 * zoom / 100) / inner`
 * through its `zoom` prop (`usePdfZoom`'s own steps and range are not used).
 */
function useViewerZoom(fileId) {
  const [box, setBox] = useState(null);
  const [inner, setInner] = useState(0);
  const [basis, setBasis] = useState(0);
  const [zoom, setZoom] = useState(100);
  // `inner`: the pane without its side gaps (the initial zoom). `basis`: the width the shared
  // viewer fits a page to at scale 1 — its own scroll box minus the same gaps, which is narrower
  // by the scroll gutter it reserves — read from the DOM so the page is exactly 595 * zoom / 100.
  const measure = useCallback(() => {
    if (!box) return;
    setInner(Math.max(0, box.clientWidth - SIDE_GAPS));
    const scroller = box.querySelector('.overflow-auto');
    setBasis(Math.max(0, (scroller ? scroller.clientWidth : box.clientWidth) - SIDE_GAPS));
  }, [box]);
  useEffect(() => {
    if (!box) return undefined;
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [box, measure]);
  // Initial zoom, once per document, from the first real measure of the pane.
  const startedFor = useRef(null);
  useEffect(() => {
    if (inner > 0 && startedFor.current !== fileId) {
      startedFor.current = fileId;
      setZoom(initialZoom(inner));
    }
  }, [inner, fileId]);
  const zoomIn = useCallback(() => setZoom((z) => stepZoom(z, 1)), []);
  const zoomOut = useCallback(() => setZoom((z) => stepZoom(z, -1)), []);
  const pageWidth = (PAPER_WIDTH * zoom) / 100;
  const pdfZoom = useMemo(
    () => ({ scale: basis > 0 ? pageWidth / basis : 1, fitMode: 'width', zoomIn, zoomOut, toggleFitMode: NO_OP }),
    [pageWidth, basis, zoomIn, zoomOut],
  );
  return { setBox, zoom, pageWidth, zoomIn, zoomOut, pdfZoom, measure };
}

/**
 * ETP-6050 F4 — the original document, left pane of the review panel: a toolbar ("DOCUMENTO
 * ORIGINAL", zoom out, "{zoom}%", zoom in, download) above the document.
 *
 * Reuses `useMainAttachment` (the main attachment of the `ETGO_INCOMING_DOCUMENT` row, fetched as
 * a blob with the session) and the shared `PdfViewer` (without its floating bar: `hideToolbar`)
 * for a PDF, or the image itself, with the same percentage. READ ONLY: none of the hook's write
 * operations (upload, mark as main, delete) is wired. Download is a plain link to the blob URL the
 * hook already holds.
 *
 * @param {{documentId: string, fileName?: string, token?: string|null, apiBaseUrl: string}} props
 */
export default function InvoiceInboxReviewViewer({ documentId, fileName, token = null, apiBaseUrl }) {
  const ui = useUI();
  const { storedFile, isBusy } = useMainAttachment({
    documentId,
    tableName: INCOMING_DOCUMENT_TABLE,
    storeCondition: true,
    token,
    apiBaseUrl,
  });
  const { setBox, zoom, pageWidth, zoomIn, zoomOut, pdfZoom, measure } = useViewerZoom(storedFile?.attachmentId);

  if (!storedFile && isBusy) {
    return (
      <Centered
        testId="invoice-inbox-review-viewer-loading"
        data-testid="Centered__e8a41d">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" data-testid="Loader2__review-viewer" />
        <span className="text-xs">{ui('invoiceInboxReviewViewerLoading')}</span>
      </Centered>
    );
  }
  if (!storedFile) {
    return (
      <Centered testId="invoice-inbox-review-viewer-empty" data-testid="Centered__e8a41d">
        <FileText className="h-8 w-8 opacity-40" aria-hidden="true" data-testid="FileText__review-viewer" />
        <span className="text-xs">{ui('invoiceInboxReviewViewerEmpty')}</span>
      </Centered>
    );
  }
  const isImage = storedFile.mimeType?.startsWith('image/');
  const downloadName = storedFile.fileName || fileName || 'document';
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="invoice-inbox-review-viewer">
      <div className="flex flex-none items-center gap-1.5 px-3.5 py-2.5" data-testid="invoice-inbox-review-viewer-toolbar">
        <span className="flex-1 text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-muted-foreground" data-testid="invoice-inbox-review-viewer-label">
          {ui('invoiceInboxReviewViewerTitle')}
        </span>
        <ToolbarButton
          label={ui('pdfViewerZoomOut')}
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          testId="invoice-inbox-review-viewer-zoom-out"
          data-testid="ToolbarButton__e8a41d">
          <ZoomOut className="h-4 w-4" aria-hidden="true" data-testid="ZoomOut__review-viewer" />
        </ToolbarButton>
        <span className="w-11 text-center font-mono text-xs font-medium tabular-nums" data-testid="invoice-inbox-review-viewer-zoom">
          {zoom}%
        </span>
        <ToolbarButton
          label={ui('pdfViewerZoomIn')}
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          testId="invoice-inbox-review-viewer-zoom-in"
          data-testid="ToolbarButton__e8a41d">
          <ZoomIn className="h-4 w-4" aria-hidden="true" data-testid="ZoomIn__review-viewer" />
        </ToolbarButton>
        {storedFile.objectUrl && (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-[30px] w-[30px] flex-none"
            data-testid="Button__e8a41d">
            <a
              href={storedFile.objectUrl}
              download={downloadName}
              aria-label={ui('download')}
              title={ui('download')}
              data-testid="invoice-inbox-review-viewer-download">
              <Download className="h-4 w-4" aria-hidden="true" data-testid="Download__review-viewer" />
            </a>
          </Button>
        )}
      </div>
      <div ref={setBox} className="min-h-0 flex-1 overflow-hidden" data-testid="invoice-inbox-review-viewer-file">
        {isImage ? (
          <div
            className="h-full overflow-auto"
            style={{ padding: `${CONTENT_PADDING.top}px ${CONTENT_PADDING.right}px ${CONTENT_PADDING.bottom}px ${CONTENT_PADDING.left}px` }}>
            <img
              src={storedFile.objectUrl}
              alt={storedFile.fileName || fileName || ''}
              className="mx-auto block max-w-none bg-card shadow-md"
              style={{ width: `${pageWidth}px` }}
              data-testid="invoice-inbox-review-viewer-image" />
          </div>
        ) : (
          <Suspense
            fallback={(
              <Centered
                testId="invoice-inbox-review-viewer-suspense"
                data-testid="Centered__e8a41d">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" data-testid="Loader2__review-viewer-lazy" />
              </Centered>
            )}
            data-testid="Suspense__review-viewer">
            <LazyPdfViewer
              url={storedFile.objectUrl}
              zoom={pdfZoom}
              hideToolbar
              onNumPages={measure}
              contentPadding={CONTENT_PADDING}
              data-testid="LazyPdfViewer__review-viewer" />
          </Suspense>
        )}
      </div>
    </div>
  );
}
