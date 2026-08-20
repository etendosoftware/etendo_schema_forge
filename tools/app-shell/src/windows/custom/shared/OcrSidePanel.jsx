import { useRef, useState, lazy, Suspense } from 'react';
import { FileText, Loader2, Paperclip, AlertCircle } from 'lucide-react';
import { useUI } from '@/i18n';
import { matchOcrDocType, getOcrDocType } from '@/components/copilot/ocr/ocrDocTypes';
import { useMainAttachment } from './useMainAttachment.js';
import { useLocation } from 'react-router-dom';
import { ACCEPTED_TYPES, ACCEPT_ATTR } from './attachmentFileTypes.js';

const LazyOcrInlineUploader = lazy(() => import('@/components/copilot/ocr/OcrInlineUploader.jsx'));
const LazyPdfViewer = lazy(() => import('./PdfViewer.jsx'));

/* eslint-disable react/prop-types */

function FileTab(props) {
  const ui = useUI();
  // isNew is forwarded by DetailView via the sidePanel callback. It mirrors
  // the same flag the inline OCR path receives (recordId === 'new'), so the
  // dropzone is shown for new records and the document view takes over once the
  // document has been saved.
  //
  // This split is also what keeps the OCR reader out of reach for an invoice
  // that was captured by hand (ETP-4855 Error 3): OcrInlineUploader — the only
  // thing that dispatches the extraction event — is never mounted in edit mode.
  // DocumentView below can attach a file but never triggers extraction.
  if (props.isNew) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {ui('ocrSidePanelTitle')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui('ocrSidePanelHint')}
          </p>
        </div>
        <Suspense fallback={null} data-testid="Suspense__c851a1">
          <LazyOcrInlineUploader {...props} data-testid="LazyOcrInlineUploader__c851a1" />
        </Suspense>
      </div>
    );
  }
  return <DocumentView {...props} data-testid="DocumentView__c851a1" />;
}

/**
 * Edit-mode view: renders the record's marked "main" Attachment and lets the
 * user fill it (ETP-4855).
 *
 * Backed by `useMainAttachment` (ETP-4315) — the same real, marked `Attachment`
 * row the grid preview shows, identified by `tableName` alone. Because it is
 * the record's actual attachment (not a separate cache), storing here already
 * appears in the Attachments tab with no mirroring step: attaching from this
 * panel and attaching from the Attachments tab write the same record.
 * Invoices captured by hand have nothing marked yet, so the panel stays empty
 * until the user attaches a file here or from the preview.
 */
function DocumentView({ recordId, token, apiBaseUrl, docTypeId }) {
  const ui = useUI();
  const tableName = getOcrDocType(docTypeId)?.tableName;
  const [pickError, setPickError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  const {
    storedFile, isBusy, storeFailed, storeFile,
  } = useMainAttachment({
    documentId: recordId,
    tableName,
    storeCondition: true,
    apiBaseUrl,
  });

  // ETP-4576 — dropped `token` from this gate for the same reason as the hook's
  // own `active`: it is undefined under a cookie session, so attaching was
  // silently impossible.
  const canAttach = !!(recordId && tableName && docTypeId);

  const handleFile = (picked) => {
    if (!picked || isBusy || !canAttach) return;
    if (!ACCEPTED_TYPES[picked.type]) {
      setPickError(ui('ocrInlinePdfOnly'));
      return;
    }
    setPickError(null);
    storeFile(picked);
  };

  const dropHandlers = {
    onDrop: (event) => {
      event.preventDefault();
      setIsDragOver(false);
      handleFile(event.dataTransfer.files?.[0]);
    },
    onDragOver: (event) => { event.preventDefault(); setIsDragOver(true); },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsDragOver(false);
    },
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT_ATTR}
      className="hidden"
      onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = ''; }}
    />
  );

  const errorText = pickError || (storeFailed ? ui('ocrSidePanelAttachError') : null);
  const errorRow = errorText ? (
    <div className="flex items-start gap-2 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" data-testid="AlertCircle__c851a1" />
      <span>{errorText}</span>
    </div>
  ) : null;

  if (isBusy && !storedFile) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-xl border-2 border-dashed border-border-control text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__c851a1" />
      </div>
    );
  }

  if (!storedFile) {
    return (
      <div className="flex h-full flex-col gap-2">
        <button
          type="button"
          disabled={!canAttach}
          onClick={() => inputRef.current?.click()}
          {...dropHandlers}
          className={`flex min-h-[360px] flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-border-control hover:bg-muted'
          }`}
        >
          <FileText className="h-8 w-8 opacity-40" data-testid="FileText__c851a1" />
          <span className="text-xs">{ui('ocrSidePanelNoAttachments')}</span>
          {canAttach && (
            <span className="text-xs font-medium text-foreground">{ui('ocrSidePanelAttach')}</span>
          )}
        </button>
        {errorRow}
        {hiddenInput}
      </div>
    );
  }

  const isImage = storedFile.mimeType?.startsWith('image/');
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" {...dropHandlers}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5 shrink-0" data-testid="FileText__c851a1" />
        <span className="truncate">{storedFile.fileName}</span>
        {canAttach && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => inputRef.current?.click()}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-border-subtle bg-card px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy
              ? <Loader2 className="h-3 w-3 animate-spin" data-testid="Loader2__c851a1" />
              : <Paperclip className="h-3 w-3" data-testid="Paperclip__c851a1" />}
            {isBusy ? ui('ocrSidePanelAttaching') : ui('ocrSidePanelAttach')}
          </button>
        )}
      </div>
      {errorRow}
      <div className={`min-h-0 flex-1 overflow-hidden rounded-xl border-2 border-dashed bg-card ${
        isDragOver ? 'border-primary' : 'border-border-control'
      }`}>
        {isImage ? (
          <div className="flex h-full w-full items-center justify-center overflow-auto">
            <img src={storedFile.objectUrl} alt={storedFile.fileName} className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <Suspense
            fallback={(
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__c851a1" />
              </div>
            )}
            data-testid="Suspense__c851a1">
            <LazyPdfViewer url={storedFile.objectUrl} data-testid="LazyPdfViewer__c851a1" />
          </Suspense>
        )}
      </div>
      {hiddenInput}
    </div>
  );
}

/**
 * Side panel for OCR-capable windows.
 *
 * ETP-4855 Error 3 removed the "Messages" / "History" tabs (both were permanent
 * "coming soon" placeholders) and the context-menu button (it had no onClick and
 * never did anything). With a single view left there is no tab bar to render.
 */
export default function OcrSidePanel(props) {
  const location = useLocation();
  const ocrDocType = matchOcrDocType(location.pathname);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <FileTab {...props} docTypeId={ocrDocType?.id} data-testid="FileTab__c851a1" />
      </div>
    </div>
  );
}
