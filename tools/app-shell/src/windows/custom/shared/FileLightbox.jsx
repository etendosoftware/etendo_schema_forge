import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ZoomIn, ZoomOut, Maximize2, Upload, Trash2, X } from 'lucide-react';
import { Dialog, DialogPortal, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { useUI } from '@/i18n';
import PdfViewer, { usePdfZoom } from './PdfViewer.jsx';

/* eslint-disable react/prop-types */

const TOOLBAR_BUTTON = 'flex h-9 items-center justify-center text-[hsl(var(--floating-toolbar-fg))] transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.12)] disabled:cursor-not-allowed disabled:opacity-40';
const TOOLBAR_BORDER = 'border border-[hsl(var(--floating-toolbar-fg)/0.3)]';

/**
 * The lightbox is a viewer, never a drop target. React synthetic drag events bubble through
 * the portal to the lightbox's React ancestors — in the form sidebar that is the container
 * whose drop handler replaces the document — so they are stopped here, for every consumer.
 * Cancelling the default (with `dropEffect: 'none'`) also keeps the browser from navigating
 * to a file dropped on the lightbox.
 */
function ignoreFileDrag(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
}

/** Width that fits the whole image in the box, never upscaled past its natural size. */
function fitImageWidth(box, natural) {
  if (!natural || natural.width <= 0 || box.width <= 32) return 0;
  const aspect = natural.height / natural.width;
  return Math.min(box.width - 16, (box.height - 16) / aspect, natural.width);
}

function LightboxImage({ src, alt, scale }) {
  const boxRef = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState(null);

  // Same rule as PdfViewer: measure the outer box, which never scrolls, so a scrollbar
  // showing up on zoom cannot feed back into the measurement.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setBox({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = fitImageWidth(box, natural) * scale;
  return (
    <div ref={boxRef} className="h-full w-full">
      <div className="h-full w-full overflow-auto">
        <div className="flex min-h-full w-fit min-w-full items-center justify-center p-2">
          <img
            src={src}
            alt={alt}
            onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            style={width > 0 ? { width, maxWidth: 'none' } : undefined}
            className={width > 0 ? 'bg-card shadow-md' : 'max-h-full max-w-full object-contain'}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Header + document. Lives inside the dialog content so its zoom and page count start
 * fresh every time the lightbox opens.
 */
function LightboxBody({ file, onReplace, onDelete, actionsDisabled }) {
  const ui = useUI();
  const zoom = usePdfZoom({ initialFitMode: 'page' });
  const [pageCount, setPageCount] = useState(0);
  const isImage = file.mimeType?.startsWith('image/');
  const pageCountKey = pageCount === 1 ? 'fileViewerPageCount_one' : 'fileViewerPageCount_plural';

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 bg-[hsl(var(--floating-toolbar-bg))] px-4 py-3">
        <div className="min-w-0 flex-1">
          <DialogTitle
            className="truncate text-sm font-bold leading-5 tracking-normal text-[hsl(var(--floating-toolbar-fg))]"
            data-testid="file-lightbox-title"
          >
            {file.fileName}
          </DialogTitle>
          {!isImage && pageCount > 0 && (
            <p className="text-xs text-[hsl(var(--floating-toolbar-muted))]" data-testid="file-lightbox-page-count">
              {ui(pageCountKey, { count: pageCount })}
            </p>
          )}
        </div>
        <div className={`flex items-stretch overflow-hidden rounded-lg ${TOOLBAR_BORDER}`}>
          <button
            type="button"
            onClick={zoom.zoomIn}
            disabled={!zoom.canZoomIn}
            className={`${TOOLBAR_BUTTON} w-10`}
            aria-label={ui('pdfViewerZoomIn')}
            title={ui('pdfViewerZoomIn')}
            data-testid="file-lightbox-zoom-in"
          >
            <ZoomIn size={18} data-testid="ZoomIn__c75ca8" />
          </button>
          <button
            type="button"
            onClick={zoom.fitToPage}
            className={`${TOOLBAR_BUTTON} w-10 border-x border-[hsl(var(--floating-toolbar-fg)/0.3)]`}
            aria-label={ui('pdfViewerFitToPage')}
            title={ui('pdfViewerFitToPage')}
            data-testid="file-lightbox-fit"
          >
            <Maximize2 size={18} data-testid="Maximize2__c75ca8" />
          </button>
          <button
            type="button"
            onClick={zoom.zoomOut}
            disabled={!zoom.canZoomOut}
            className={`${TOOLBAR_BUTTON} w-10`}
            aria-label={ui('pdfViewerZoomOut')}
            title={ui('pdfViewerZoomOut')}
            data-testid="file-lightbox-zoom-out"
          >
            <ZoomOut size={18} data-testid="ZoomOut__c75ca8" />
          </button>
        </div>
        {onReplace && (
          <button
            type="button"
            onClick={onReplace}
            disabled={actionsDisabled}
            className={`${TOOLBAR_BUTTON} ${TOOLBAR_BORDER} gap-2 rounded-lg px-3 text-sm font-medium`}
            data-testid="file-lightbox-replace"
          >
            <Upload size={16} data-testid="Upload__c75ca8" />
            {ui('fileViewerReplace')}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={actionsDisabled}
            className="flex h-9 w-10 items-center justify-center rounded-lg border border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/0.15)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={ui('fileViewerDelete')}
            title={ui('fileViewerDelete')}
            data-testid="file-lightbox-delete"
          >
            <Trash2 size={16} data-testid="Trash2__c75ca8" />
          </button>
        )}
        <DialogClose asChild data-testid="DialogClose__c75ca8">
          <button
            type="button"
            className={`${TOOLBAR_BUTTON} w-10 rounded-lg`}
            aria-label={ui('close')}
            title={ui('close')}
            data-testid="file-lightbox-close"
          >
            <X size={18} data-testid="X__c75ca8" />
          </button>
        </DialogClose>
      </div>
      <div className="min-h-0 flex-1">
        {isImage ? (
          <LightboxImage
            src={file.objectUrl}
            alt={file.fileName}
            scale={zoom.scale}
            data-testid="LightboxImage__c75ca8" />
        ) : (
          <PdfViewer
            url={file.objectUrl}
            zoom={zoom}
            hideToolbar
            onNumPages={setPageCount}
            data-testid="PdfViewer__c75ca8" />
        )}
      </div>
    </>
  );
}

/**
 * Full-viewport viewer for an uploaded file (ETP-5518): the document at a larger size with
 * its own zoom controls, plus Replace / Delete when the caller allows them.
 *
 * A Radix dialog, so it gets the focus trap, focus return to the trigger and the layer
 * stack for free — Escape closes only the topmost layer, which matters because this opens
 * on top of the invoice form or the list preview and a delete confirmation opens on top
 * of it in turn. Files dragged onto it are ignored (see `ignoreFileDrag`).
 *
 * @param {boolean}  open
 * @param {Function} onClose
 * @param {{ objectUrl: string, fileName: string, mimeType?: string }} file
 * @param {Function} [onReplace]        - omitted → no Replace button (writes are gated).
 * @param {Function} [onDelete]         - omitted → no Delete button.
 * @param {boolean}  [actionsDisabled]  - a write is in flight.
 */
export default function FileLightbox({
  open, onClose, file, onReplace, onDelete, actionsDisabled = false,
}) {
  // Radix hands focus back only to a `Dialog.Trigger`, and this lightbox has none (it is
  // opened by clicking the preview), so the element that had focus is remembered here.
  const returnFocusRef = useRef(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!value) onClose?.(); }}
      data-testid="Dialog__c75ca8">
      <DialogPortal data-testid="DialogPortal__c75ca8">
        <DialogPrimitive.Content
          aria-modal="true"
          aria-describedby={undefined}
          // Radix listens for Escape on `document` in the capture phase; stopping it there
          // keeps the key from reaching document-level listeners of the view underneath.
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onOpenAutoFocus={() => { returnFocusRef.current = document.activeElement; }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
          }}
          onDragEnter={ignoreFileDrag}
          onDragOver={ignoreFileDrag}
          onDragLeave={ignoreFileDrag}
          onDrop={ignoreFileDrag}
          className="fixed inset-0 z-50 flex flex-col bg-[hsl(var(--scrim))] focus:outline-none"
          data-testid="file-lightbox"
        >
          <LightboxBody
            file={file}
            onReplace={onReplace}
            onDelete={onDelete}
            actionsDisabled={actionsDisabled}
            data-testid="LightboxBody__c75ca8" />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
