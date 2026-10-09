import { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ZoomIn, ZoomOut, Maximize2, Loader2, AlertCircle } from 'lucide-react';
import { useUI } from '@/i18n';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const A4_ASPECT = 842 / 595; // portrait height/width ratio
const roundScale = (value) => Math.round(value * 100) / 100;
// Default colours of the floating zoom bar (each one overridable through `controlColors`).
const DEFAULT_CONTROL_COLORS = {
  background: 'hsl(var(--card))',
  border: 'hsl(var(--border-control))',
  divider: 'hsl(var(--border-subtle))',
  shadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
  icon: 'hsl(var(--text-disabled))',
  iconActive: 'hsl(var(--foreground))',
};
// Default gap around the sheet: 8px above and below, 16px split across both sides.
const DEFAULT_PADDING = { top: 8, right: 8, bottom: 8, left: 8 };

/**
 * Zoom state of a PdfViewer. The viewer owns one by default; a caller that draws its own
 * controls (the file lightbox header, ETP-5518) creates it here and hands it over as `zoom`.
 * Zoom steps are rounded so repeated steps stay exact (1 + 0.15 - 0.15 would otherwise be
 * 0.9999…), ETP-5598.
 */
export function usePdfZoom({ initialFitMode = 'width' } = {}) {
  const [scale, setScale] = useState(1.0);
  const [fitMode, setFitMode] = useState(initialFitMode); // 'width' | 'page'

  const zoomIn = useCallback(() => setScale((s) => roundScale(Math.min(s + ZOOM_STEP, MAX_ZOOM))), []);
  const zoomOut = useCallback(() => setScale((s) => roundScale(Math.max(s - ZOOM_STEP, MIN_ZOOM))), []);
  const toggleFitMode = useCallback(() => {
    setFitMode((m) => (m === 'width' ? 'page' : 'width'));
    setScale(1.0);
  }, []);
  const fitToPage = useCallback(() => {
    setFitMode('page');
    setScale(1.0);
  }, []);

  return {
    scale, fitMode, zoomIn, zoomOut, toggleFitMode, fitToPage,
    canZoomIn: scale < MAX_ZOOM,
    canZoomOut: scale > MIN_ZOOM,
  };
}

/**
 * Shared react-pdf viewer: pages fitted to the container width, with a floating zoom
 * bar at the top right (zoom in / fit-to-page toggle / zoom out).
 *
 * Optional props (omitting them keeps the original behaviour for every caller):
 * - zoom: external zoom state from `usePdfZoom`; omitted → internal (ETP-5518).
 * - hideToolbar: drop the floating zoom group (the caller draws its own) (ETP-5518).
 * - toolbarExtra: extra control appended to the floating zoom group (ETP-5518).
 * - onExpand: when set, clicking the rendered pages calls it (ETP-5518).
 * - onNumPages: reports the page count once the document loads (ETP-5518).
 * - contentPadding: { top, right, bottom, left } in px — the space kept around the
 *   sheet; the fitted width is the container width minus left + right. While not
 *   zoomed in the x-axis is clipped (the sheet always fits), so a vertical scrollbar
 *   can only eat into the empty right padding, never surface a horizontal scrollbar.
 * - fitIcon: lucide icon component for the fit button (default `Maximize2`).
 * - controlColors: partial { background, border, divider, shadow, icon, iconActive } CSS
 *   colours for the zoom bar; missing keys keep the defaults above.
 */
export default function PdfViewer({
  url, zoom, hideToolbar = false, toolbarExtra = null, onExpand, onNumPages,
  contentPadding, fitIcon: FitIcon = Maximize2, controlColors,
}) {
  const colors = { ...DEFAULT_CONTROL_COLORS, ...controlColors };
  const ui = useUI();
  const ownZoom = usePdfZoom();
  const { scale, fitMode, zoomIn, zoomOut, toggleFitMode } = zoom ?? ownZoom;
  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  // contentPadding only: the scroll box's client width. Its scrollbar gutter is
  // `stable`, so this width does not change when zooming adds or removes overflow —
  // reading it here cannot start the resize loop described below.
  const [scrollClientWidth, setScrollClientWidth] = useState(0);
  const [pageAspect, setPageAspect] = useState(A4_ASPECT);
  const [loadError, setLoadError] = useState(null);
  const containerRef = useRef(null);
  const scrollRef = useRef(null);

  // Measure the OUTER (containerRef) size, not scrollRef. scrollRef has
  // `overflow-auto`, so when zoom-in makes the PDF overflow, scrollbars steal
  // pixels from its content-box → ResizeObserver fires → re-renders → loop.
  // The outer wrapper has no scroll, so its size is stable.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerWidth(e.contentRect.width);
        setContainerHeight(e.contentRect.height);
        setScrollClientWidth(scrollRef.current?.clientWidth ?? 0);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitActive = fitMode === 'page';

  const handlePageLoad = useCallback((page) => {
    const w = page?.originalWidth ?? page?.width;
    const h = page?.originalHeight ?? page?.height;
    if (w > 0 && h > 0) setPageAspect(h / w);
  }, []);

  const padding = contentPadding ?? DEFAULT_PADDING;
  const horizontalPadding = padding.left + padding.right;
  // With contentPadding the sheet is sized against the scroll box's client width, so a
  // classic (non-overlay) scrollbar does not eat into the right gap: left and right
  // gaps stay equal. jsdom reports 0, hence the container-width fallback.
  const fitBoxWidth = contentPadding && scrollClientWidth > 0 ? scrollClientWidth : containerWidth;
  const widthFit = fitBoxWidth > 2 * horizontalPadding ? fitBoxWidth - horizontalPadding : 0;
  const availableHeight = containerHeight - padding.top - padding.bottom;
  const heightFit = availableHeight > 16 ? availableHeight / pageAspect : 0;
  const baseWidth = fitMode === 'page' && heightFit > 0
    ? Math.min(widthFit, heightFit)
    : widthFit;
  const effectiveWidth = baseWidth > 0 ? baseWidth * scale : undefined;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col">
      {/* Button Group — top-right floating */}
      {!hideToolbar && (<div
        className="absolute top-2 right-2 z-10 flex items-stretch rounded-lg overflow-hidden"
        style={{
          background: colors.background,
          border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow,
        }}
      >
        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= MAX_ZOOM}
          className="w-12 h-[38px] flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={ui('pdfViewerZoomIn')}
        >
          <ZoomIn size={20} style={{ color: colors.icon }} data-testid="ZoomIn__fca188" />
        </button>
        <div style={{ width: 1, backgroundColor: colors.divider }} />
        <button
          type="button"
          onClick={toggleFitMode}
          aria-pressed={fitActive}
          className="w-12 h-[38px] flex items-center justify-center hover:bg-muted transition-colors"
          aria-label={ui('pdfViewerFitToPage')}
        >
          <FitIcon
            size={20}
            style={{ color: fitActive ? colors.iconActive : colors.icon }}
            data-testid="Maximize2__fca188" />
        </button>
        <div style={{ width: 1, backgroundColor: colors.divider }} />
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= MIN_ZOOM}
          className="w-12 h-[38px] flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={ui('pdfViewerZoomOut')}
        >
          <ZoomOut size={20} style={{ color: colors.icon }} data-testid="ZoomOut__fca188" />
        </button>
        {toolbarExtra && (
          <>
            <div style={{ width: 1, backgroundColor: colors.divider }} />
            {toolbarExtra}
          </>
        )}
      </div>)}
      {/* PDF scroll container */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto"
        style={contentPadding ? { scrollbarGutter: 'stable', ...(scale <= 1 ? { overflowX: 'hidden' } : {}) } : undefined}
      >
        <div
          className="relative w-fit mx-auto"
          style={contentPadding
            ? { padding: `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` }
            : { paddingTop: padding.top, paddingBottom: padding.bottom }}
        >
          <Document
            file={url}
            onLoadSuccess={({ numPages }) => { setNumPages(numPages); setLoadError(null); onNumPages?.(numPages); }}
            onLoadError={(err) => setLoadError(err?.message || 'Error')}
            loading={(
              <div className="flex items-center justify-center gap-2 text-muted-foreground p-12">
                <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__fca188" />
                <span className="text-sm">{ui('invoicePdfGenerating')}</span>
              </div>
            )}
            error={(
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <AlertCircle className="h-8 w-8 text-status-warning-foreground" data-testid="AlertCircle__fca188" />
                <p className="text-sm text-muted-foreground">{ui('invoicePdfError')}</p>
                {loadError && <p className="text-xs text-muted-foreground/60">{loadError}</p>}
              </div>
            )}
            data-testid="Document__fca188">
            {Boolean(effectiveWidth) && Array.from({ length: numPages }, (_, i) => (
              <Page
                key={`page-${i + 1}`}
                pageNumber={i + 1}
                width={effectiveWidth}
                onLoadSuccess={i === 0 ? handlePageLoad : undefined}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="mb-2 last:mb-0 bg-card shadow-md"
                data-testid="Page__fca188" />
            ))}
          </Document>
          {/* A transparent button over the pages rather than a click handler on them: it is
              keyboard-reachable and scrolls with the document. */}
          {onExpand && numPages > 0 && (
            <button
              type="button"
              onClick={onExpand}
              className="absolute inset-0 cursor-zoom-in"
              aria-label={ui('fileViewerExpand')}
              title={ui('fileViewerExpand')}
              data-testid="file-viewer-expand"
            />
          )}
        </div>
      </div>
    </div>
  );
}
