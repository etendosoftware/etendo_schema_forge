import { useState, useEffect, lazy, Suspense } from 'react';
import { MoreVertical, FileText, MessageSquare, History, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { matchOcrDocType, getOcrDocType } from '@/components/copilot/ocr/ocrDocTypes';
import { listAttachments, fetchAttachmentBlobUrl } from '@/components/copilot/ocr/listAttachments';
import { useLocation } from 'react-router-dom';

const LazyOcrInlineUploader = lazy(() => import('@/components/copilot/ocr/OcrInlineUploader.jsx'));
const LazyPdfViewer = lazy(() => import('./PdfViewer.jsx'));

/* eslint-disable react/prop-types */

const TABS = [
  { key: 'file', icon: FileText, labelKey: 'ocrSidePanelTabFile' },
  { key: 'messages', icon: MessageSquare, labelKey: 'ocrSidePanelTabMessages' },
  { key: 'history', icon: History, labelKey: 'ocrSidePanelTabHistory' },
];

function ComingSoon({ Icon }) {
  const ui = useUI();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
      <Icon className="h-8 w-8 opacity-40" data-testid="Icon__c851a1" />
      <span className="text-xs">{ui('ocrSidePanelComingSoon')}</span>
    </div>
  );
}

function FileTab(props) {
  const ui = useUI();
  // isNew is forwarded by DetailView via the sidePanel callback. It mirrors
  // the same flag the inline OCR path receives (recordId === 'new'), so the
  // dropzone is shown for new records and the attachment viewer takes over
  // once the document has been saved.
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
  return <AttachmentsView {...props} data-testid="AttachmentsView__c851a1" />;
}

/**
 * Edit-mode view of the file tab: lists attachments tied to the current
 * record (saved via AttachFile during the OCR flow) and renders the first
 * PDF inline. Falls back to a quiet empty-state when nothing is attached —
 * common for records created before OCR or for non-OCR docs.
 */
function AttachmentsView({ recordId, token, apiBaseUrl, docTypeId }) {
  const ui = useUI();
  const tableName = getOcrDocType(docTypeId)?.tableName;
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState([]);
  const [pdfUrl, setPdfUrl] = useState(null);

  useEffect(() => {
    if (!recordId || !tableName || !token) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    let createdUrl = null;
    setLoading(true);
    (async () => {
      const list = await listAttachments({ token, tableName, recordId, apiBaseUrl });
      if (cancelled) return;
      setAttachments(list);
      // Render the first PDF inline; non-PDF rows still appear in the list.
      const firstPdf = list.find(a => /\.pdf$/i.test(a.name || ''));
      if (firstPdf?.id) {
        createdUrl = await fetchAttachmentBlobUrl({ token, attachmentId: firstPdf.id, apiBaseUrl });
        if (cancelled) {
          if (createdUrl) URL.revokeObjectURL(createdUrl);
          return;
        }
        if (createdUrl) setPdfUrl(createdUrl);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [recordId, tableName, token, apiBaseUrl]);

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__c851a1" />
      </div>
    );
  }
  if (attachments.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 text-muted-foreground">
        <FileText className="h-8 w-8 opacity-40" data-testid="FileText__c851a1" />
        <span className="text-xs">{ui('ocrSidePanelNoAttachments')}</span>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" data-testid="FileText__c851a1" />
        <span className="truncate">{attachments[0].name}</span>
      </div>
      {pdfUrl && (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-white">
          <Suspense
            fallback={(
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__c851a1" />
              </div>
            )}
            data-testid="Suspense__c851a1">
            <LazyPdfViewer url={pdfUrl} data-testid="LazyPdfViewer__c851a1" />
          </Suspense>
        </div>
      )}
    </div>
  );
}

export default function OcrSidePanel(props) {
  const ui = useUI();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('file');

  const ocrDocType = matchOcrDocType(location.pathname);
  const slotProps = { ...props, docTypeId: ocrDocType?.id };

  let body;
  if (activeTab === 'file') {
    body = <FileTab {...slotProps} data-testid="FileTab__c851a1" />;
  } else if (activeTab === 'messages') {
    body = <ComingSoon Icon={MessageSquare} data-testid="ComingSoon__c851a1" />;
  } else {
    body = <ComingSoon Icon={History} data-testid="ComingSoon__c851a1" />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-1" role="tablist">
          {TABS.map(({ key, labelKey }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border border-gray-200 bg-white text-foreground shadow-sm'
                    : 'border border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {ui(labelKey)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="rounded-md border border-gray-200 bg-white p-1.5 text-muted-foreground hover:text-foreground"
          aria-label={ui('ocrSidePanelMore')}
        >
          <MoreVertical className="h-4 w-4" data-testid="MoreVertical__c851a1" />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {body}
      </div>
    </div>
  );
}
