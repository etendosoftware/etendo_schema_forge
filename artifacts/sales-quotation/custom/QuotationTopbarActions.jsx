import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal';
import QuotationConfirmModal from './QuotationConfirmModal';
import SendToEvaluationModal from './SendToEvaluationModal';
import RejectQuotationModal from './RejectQuotationModal';
import { useQuotationPdf } from '@/windows/custom/shared/useQuotationPdf.js';
import { useMenuLabel } from '@/i18n';

export default function QuotationTopbarActions({ data, recordId, token, apiBaseUrl, onSave, onRefresh }) {
  const tMenu = useMenuLabel();
  const [showSend, setShowSend] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSendToEval, setShowSendToEval] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const status = data?.documentStatus;

  // ETP-4372 — source the same client-rendered PDF the QuotationPreview panel
  // uses, so the form-view topbar Send modal shows the document instead of the
  // "PDF not configured" fallback. Hook is called unconditionally (rules of hooks).
  const { pdfUrl, loading: pdfLoading } = useQuotationPdf(recordId, apiBaseUrl, token);

  // The framework's draftMode renders a "Confirmar" primary button after Save.
  // The wrapper at tools/app-shell/src/windows/custom/sales-quotation/index.jsx
  // overrides draftMode.onConfirm so that clicking it dispatches this event,
  // which we route to the right modal based on the current quotation status.
  useEffect(() => {
    function handler() {
      if (status === 'DR') setShowSendToEval(true);
      else if (status === 'CO' || status === 'UE') setShowConfirm(true);
    }
    window.addEventListener('sales-quotation:open-confirm-modal', handler);
    return () => window.removeEventListener('sales-quotation:open-confirm-modal', handler);
  }, [status]);

  // The wrapper's customMenuActions dispatches this event when the user clicks
  // the kebab "Reject" item (only visible while status === 'UE').
  useEffect(() => {
    function handler() { setShowReject(true); }
    window.addEventListener('sales-quotation:open-reject-modal', handler);
    return () => window.removeEventListener('sales-quotation:open-reject-modal', handler);
  }, []);

  // ETP-5260 — the Send button now lives in the topbarSecondary slot
  // (QuotationSecondaryActions), while this modal (with its pdf/documentType
  // context) stays here in topbarRight; the button dispatches this event to open it.
  useEffect(() => {
    function handler() { setShowSend(true); }
    window.addEventListener('sales-quotation:open-send-modal', handler);
    return () => window.removeEventListener('sales-quotation:open-send-modal', handler);
  }, []);

  if (!status) return null;

  return (
    <>
      {/* ETP-5260 — Clone/Copy-link/Send moved to the topbarSecondary slot
          (QuotationSecondaryActions). This component now only renders the
          PRIMARY flow modals below. */}
      {showSendToEval && createPortal(
        <SendToEvaluationModal
          quotationId={recordId}
          data={data}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowSendToEval(false)}
        />,
        document.body,
      )}

      {showConfirm && createPortal(
        <QuotationConfirmModal
          quotationId={recordId}
          data={data}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onSave={onSave}
          onRefresh={onRefresh}
          onClose={() => setShowConfirm(false)}
        />,
        document.body,
      )}

      {showSend && createPortal(
        <SendDocumentModal
          documentType={tMenu('Sales Quotation')}
          documentNo={data?.documentNo}
          bpName={data?.['businessPartner$_identifier']}
          bPartnerId={data?.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={recordId}
          windowName="sales-quotation"
          token={token}
          pdfBlobUrl={pdfUrl}
          pdfBlobLoading={pdfLoading}
          onClose={() => setShowSend(false)}
        />,
        document.body,
      )}

      {showReject && createPortal(
        <RejectQuotationModal
          quotationId={recordId}
          data={data}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowReject(false)}
        />,
        document.body,
      )}
    </>
  );
}
