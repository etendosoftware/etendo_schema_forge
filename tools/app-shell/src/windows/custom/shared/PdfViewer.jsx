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

export default function PdfViewer({ url }) {
  const ui = useUI();
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [pageAspect, setPageAspect] = useState(A4_ASPECT);
  const [fitMode, setFitMode] = useState('width'); // 'width' | 'page'
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
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + ZOOM_STEP, MAX_ZOOM)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - ZOOM_STEP, MIN_ZOOM)), []);
  const toggleFitMode = useCallback(() => {
    setFitMode((m) => (m === 'width' ? 'page' : 'width'));
    setScale(1.0);
  }, []);

  const handlePageLoad = useCallback((page) => {
    const w = page?.originalWidth ?? page?.width;
    const h = page?.originalHeight ?? page?.height;
    if (w > 0 && h > 0) setPageAspect(h / w);
  }, []);

  const widthFit = containerWidth > 32 ? containerWidth - 16 : 0;
  const heightFit = containerHeight > 32 ? (containerHeight - 16) / pageAspect : 0;
  const baseWidth = fitMode === 'page' && heightFit > 0
    ? Math.min(widthFit, heightFit)
    : widthFit;
  const effectiveWidth = baseWidth > 0 ? baseWidth * scale : undefined;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col">
      {/* Button Group — top-right floating */}
      <div
        className="absolute top-2 right-2 z-10 flex items-stretch bg-white rounded-lg overflow-hidden"
        style={{
          border: '1px solid #D1D4DB',
          boxShadow: '0px 1px 2px rgba(18, 18, 23, 0.05)',
        }}
      >
        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= MAX_ZOOM}
          className="w-12 h-[38px] flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={ui('pdfViewerZoomIn')}
        >
          <ZoomIn size={20} style={{ color: '#828FA3' }} data-testid="ZoomIn__fca188" />
        </button>
        <div style={{ width: 1, backgroundColor: '#E8EAEF' }} />
        <button
          type="button"
          onClick={toggleFitMode}
          className="w-12 h-[38px] flex items-center justify-center hover:bg-gray-50 transition-colors"
          aria-label={ui('pdfViewerFitToPage')}
        >
          <Maximize2
            size={20}
            style={{ color: fitMode === 'page' ? '#121217' : '#828FA3' }}
            data-testid="Maximize2__fca188" />
        </button>
        <div style={{ width: 1, backgroundColor: '#E8EAEF' }} />
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= MIN_ZOOM}
          className="w-12 h-[38px] flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={ui('pdfViewerZoomOut')}
        >
          <ZoomOut size={20} style={{ color: '#828FA3' }} data-testid="ZoomOut__fca188" />
        </button>
      </div>
      {/* PDF scroll container */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div className="w-fit mx-auto py-2">
          <Document
            file={url}
            onLoadSuccess={({ numPages }) => { setNumPages(numPages); setLoadError(null); }}
            onLoadError={(err) => setLoadError(err?.message || 'Error')}
            loading={(
              <div className="flex items-center justify-center gap-2 text-muted-foreground p-12">
                <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__fca188" />
                <span className="text-sm">{ui('invoicePdfGenerating')}</span>
              </div>
            )}
            error={(
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <AlertCircle className="h-8 w-8 text-amber-400" data-testid="AlertCircle__fca188" />
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
                className="mb-2 last:mb-0 bg-white shadow-md"
                data-testid="Page__fca188" />
            ))}
          </Document>
        </div>
      </div>
    </div>
  );
}
