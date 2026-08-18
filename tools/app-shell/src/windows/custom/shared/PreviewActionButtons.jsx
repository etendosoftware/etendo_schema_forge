import { useState, useCallback } from 'react';
import { Edit2, Mail, Download, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import PdfViewer from './PdfViewer.jsx';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal.jsx';

export default function PreviewActionButtons({
  triggerEdit,
  onEmail,
  onDownloadPdf,
  hasPdf,
  sendLabel,
  downloadLabel,
  editLabel,
}) {
  return (
    <>
      {onEmail && (
        <Button
          size="sm"
          className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground))] text-primary-foreground [&_svg]:size-5"
          onClick={onEmail}
          data-testid="Button__9ccdc3">
          <Mail data-testid="Mail__9ccdc3" />
          {sendLabel}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-card border-[hsl(var(--border-control))] shadow-sm text-[hsl(var(--foreground))] disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-5"
        disabled={!hasPdf || !onDownloadPdf}
        onClick={hasPdf && onDownloadPdf ? onDownloadPdf : undefined}
        data-testid="Button__9ccdc3">
        <Download className="text-[hsl(var(--text-disabled))]" data-testid="Download__9ccdc3" />
        {downloadLabel}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-card border-[hsl(var(--border-control))] shadow-sm text-[hsl(var(--foreground))] [&_svg]:size-5"
        onClick={triggerEdit}
        data-testid="Button__9ccdc3">
        <Edit2 className="text-[hsl(var(--text-disabled))]" data-testid="Edit2__9ccdc3" />
        {editLabel}
      </Button>
    </>
  );
}

export function PreviewEmptyPanel({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-20">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}

/**
 * Shared hook for the send-via-email modal state used in preview components.
 * Returns { showSendModal, sendModalClosing, openEmailModal, closeEmailModal }.
 */
export function usePreviewSendModal() {
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalClosing, setSendModalClosing] = useState(false);
  const openEmailModal = useCallback(() => setShowSendModal(true), []);
  const closeEmailModal = useCallback(() => {
    setSendModalClosing(true);
    setTimeout(() => { setSendModalClosing(false); setShowSendModal(false); }, 280);
  }, []);
  return { showSendModal, sendModalClosing, openEmailModal, closeEmailModal };
}

/**
 * Conditionally renders the SendDocumentModal with the props common to all preview modals.
 * Eliminates the repeated {showSendModal && <SendDocumentModal .../>} block per window.
 */
export function PreviewSendModal({ show, closing, documentType, documentNo, bpName, bPartnerId, apiBaseUrl, documentId, windowName, token, pdfBlobUrl, pdfBlobLoading, onClose }) {
  if (!show) return null;
  return (
    <SendDocumentModal
      documentType={documentType}
      documentNo={documentNo}
      bpName={bpName}
      bPartnerId={bPartnerId}
      apiBaseUrl={apiBaseUrl}
      documentId={documentId}
      windowName={windowName}
      token={token}
      pdfBlobUrl={pdfBlobUrl}
      pdfBlobLoading={pdfBlobLoading}
      isClosing={closing}
      onClose={onClose}
      data-testid="SendDocumentModal__9ccdc3" />
  );
}

/**
 * Variant of PreviewSendModal that derives documentNo / bPartnerId / documentId
 * from a receipt/shipment record object, reducing repeated prop spreading.
 */
export function ReceiptSendModal({ sendModal, documentType, receipt, partnerName, apiBaseUrl, token, windowName, pdfBlobUrl, pdfBlobLoading }) {
  return (
    <PreviewSendModal
      show={sendModal.showSendModal}
      closing={sendModal.sendModalClosing}
      documentType={documentType}
      documentNo={receipt.documentNo}
      bpName={partnerName}
      bPartnerId={receipt.businessPartner}
      apiBaseUrl={apiBaseUrl}
      documentId={receipt.id}
      windowName={windowName}
      token={token}
      pdfBlobUrl={pdfBlobUrl}
      pdfBlobLoading={pdfBlobLoading}
      onClose={sendModal.closeEmailModal}
      data-testid="PreviewSendModal__9ccdc3" />
  );
}

/** Shared PDF left-panel for document preview modals: spinner → error → iframe. */
export function PreviewPdfPanel({ pdfLoading, pdfError, pdfUrl, generatingText, errorText }) {
  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-hidden">
      {pdfLoading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__9ccdc3" />
          <span className="text-sm">{generatingText}</span>
        </div>
      )}
      {pdfError && !pdfLoading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertCircle className="h-8 w-8 text-status-warning-foreground" data-testid="AlertCircle__9ccdc3" />
          <p className="text-sm text-muted-foreground">{errorText}</p>
          <p className="text-xs text-muted-foreground/60">{pdfError}</p>
        </div>
      )}
      {pdfUrl && !pdfLoading && <PdfViewer url={pdfUrl} data-testid="PdfViewer__9ccdc3" />}
    </div>
  );
}
