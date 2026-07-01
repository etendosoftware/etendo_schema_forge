import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

const LazyPdfViewer = lazy(() => import('@/windows/custom/shared/PdfViewer.jsx'));
import { useUI } from '@/i18n';
import { useCopilot } from '@/components/CopilotContext';
import { getOcrDocType } from './ocrDocTypes';
import { attachFile } from './attachFile';
import { buildOcrSchema } from './buildOcrSchema';
import { useOcrExtraction } from './useOcrExtraction';
import { useOcrFlow } from './useOcrFlow';

/* eslint-disable react/prop-types */

export default function OcrInlineUploader({
  docTypeId,
  isNew,
  apiBaseUrl,
  onRefresh,
  token: tokenProp,
  // Legacy props kept for backward compat with DetailView's slot bag:
  // - onFieldChange / onSave / onAddChild / entity were used by the previous
  //   client-side orchestration. The /batch endpoint owns persistence now,
  //   so these are accepted-but-ignored. DetailView still passes them.
  // eslint-disable-next-line no-unused-vars
  onFieldChange, onSave, onAddChild, entity, ...slotRest
}) {
  const ui = useUI();
  const navigate = useNavigate();
  const { token: copilotToken } = useCopilot();
  const token = tokenProp || copilotToken;
  const docType = getOcrDocType(docTypeId);
  const inputRef = useRef(null);
  // Snapshot of the dropped file at the moment the user triggered extraction.
  // Used post-commit to attach the source PDF to the just-created record —
  // we cannot rely on `file` state because the component unmounts on nav.
  const fileAtExtractRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pickError, setPickError] = useState(null);

  // Build a Blob URL for the selected file so we can render its first page
  // immediately, before the OCR extraction even runs. Revoked on file change
  // or unmount to avoid leaking memory.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const { result, loading: applying, pendingModal } = useOcrFlow({
    docTypeId,
    token,
    apiBaseUrl,
    onRefresh,
  });

  // After a successful batch commit:
  //   1. attach the source PDF to the new record (if a tabId is registered)
  //   2. hop from /<window>/new to /<window>/<newId> so the form binds to it
  // Attachment failure is non-fatal — the document was created, the file just
  // didn't get persisted; we still navigate so the user sees the result.
  useEffect(() => {
    if (!result?.committed || !result?.recordId || !docType?.routePrefix) return;
    const newId = result.recordId;
    const sourceFile = fileAtExtractRef.current;
    (async () => {
      if (sourceFile && docType.tabId && token) {
        const res = await attachFile({
          token,
          tabId: docType.tabId,
          recordId: newId,
          file: sourceFile,
        });
        if (res?.error) {
          console.warn('[OCR] AttachFile failed (non-fatal):', res.error);
        }
      }
      navigate(`${docType.routePrefix}${newId}`, { replace: true });
    })();
  }, [result?.committed, result?.recordId, docType, navigate, token]);
  const { extract, status, error, reset } = useOcrExtraction({
    token,
    toolName: docType?.toolName,
    question: docType?.question,
    structuredOutput: docType?.structuredOutput,
    structuredOutputSchema: docType ? buildOcrSchema(docType) : null,
  });

  if (!isNew || !docType) return null;

  const isBusy = applying || status === 'uploading' || status === 'extracting';

  const loadFile = (picked) => {
    if (!picked) return;
    const isPdf = picked.type === 'application/pdf'
      || /\.pdf$/i.test(picked.name || '');
    if (!isPdf) {
      setFile(null);
      setPickError(ui('ocrInlinePdfOnly'));
      reset();
      return;
    }
    setPickError(null);
    setFile(picked);
    reset();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    loadFile(event.dataTransfer.files?.[0]);
  };

  const handleExtract = async () => {
    if (!file || isBusy) return;
    // Snapshot the file before kicking off extraction. The post-commit effect
    // reads this ref to attach the PDF to the new record; it cannot use the
    // `file` state directly because the component unmounts on navigation.
    fileAtExtractRef.current = file;
    try {
      const payload = await extract(file);
      window.dispatchEvent(new CustomEvent(docType.eventName, { detail: payload }));
    } catch {
      // surfaced via status/error
    }
  };

  const clearFile = () => {
    setFile(null);
    reset();
  };

  let buttonLabel;
  if (isBusy) {
    buttonLabel = ui('ocrProcessing');
  } else if (file) {
    buttonLabel = ui('ocrExtractFill');
  } else {
    buttonLabel = ui('ocrInlineBrowse');
  }

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {file ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white p-3">
          <div className="flex items-center gap-2 text-xs">
            <Upload
              className="h-3.5 w-3.5 shrink-0 text-gray-500"
              data-testid="Upload__5fab8d" />
            <span className="truncate font-medium text-foreground">{file.name}</span>
            <span className="shrink-0 text-muted-foreground">
              ({(file.size / 1024).toFixed(1)} KB)
            </span>
            <button
              type="button"
              onClick={clearFile}
              disabled={isBusy}
              className="ml-auto text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label={ui('cancel')}
            >
              <X className="h-4 w-4" data-testid="X__5fab8d" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-md bg-gray-50">
            {previewUrl && (
              <Suspense
                fallback={(
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__5fab8d" />
                  </div>
                )}
                data-testid="Suspense__5fab8d">
                <LazyPdfViewer url={previewUrl} data-testid="LazyPdfViewer__5fab8d" />
              </Suspense>
            )}
          </div>
          <button
            type="button"
            onClick={handleExtract}
            disabled={isBusy}
            className="w-full shrink-0 rounded-md border border-gray-900 px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {buttonLabel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          onDrop={handleDrop}
          onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragOver(false); }}
          className={`flex min-h-[360px] w-full flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-gray-300 bg-transparent hover:bg-gray-50'
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-300 bg-white">
            <Upload className="h-5 w-5 text-gray-600" data-testid="Upload__5fab8d" />
          </div>
          <div className="text-sm font-medium text-foreground">
            {ui('ocrSidePanelDropTitle')}
          </div>
          <div className="text-xs text-muted-foreground">
            {ui('ocrSidePanelDropHint')}
          </div>
        </button>
      )}
      {status === 'uploading' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" data-testid="Loader2__5fab8d" />
          {ui('ocrUploading')}
        </div>
      )}
      {(status === 'extracting' || applying) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" data-testid="Loader2__5fab8d" />
          {ui('ocrExtracting')}
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-2 text-xs text-red-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" data-testid="AlertCircle__5fab8d" />
          <span>{error || ui('ocrFailed')}</span>
        </div>
      )}
      {pickError && (
        <div className="flex items-start gap-2 text-xs text-red-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" data-testid="AlertCircle__5fab8d" />
          <span>{pickError}</span>
        </div>
      )}
      {result && status === 'done' && !applying && (
        <div className="flex items-center gap-2 text-xs text-emerald-600">
          <CheckCircle2 className="h-3 w-3" data-testid="CheckCircle2__5fab8d" />
          {ui('ocrDone')}
          {result.linesCreated > 0 && ` · ${ui('ocrLinesCreated', { count: result.linesCreated })}`}
          {result.linesFailed > 0 && (
            <span className="text-amber-600"> · {ui('ocrLinesFailed', { count: result.linesFailed })}</span>
          )}
          {result.unresolved?.length > 0 && (
            <span className="text-amber-600"> · {result.unresolved.length} {ui('ocrUnresolved')}</span>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => { loadFile(event.target.files?.[0]); event.target.value = ''; }}
      />
      {pendingModal}
    </div>
  );
}