import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import QuotationConfirmModal from './QuotationConfirmModal';
import SendToEvaluationModal from './SendToEvaluationModal';
import RejectQuotationModal from './RejectQuotationModal';
import { useUI, useMenuLabel } from '@/i18n';

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

const btnCloneStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '7px',
  borderRadius: 6,
  border: '1px solid #D1D4DB',
  background: '#FFFFFF',
  color: '#64748B',
  cursor: 'pointer',
  boxShadow: '0px 1px 2px 0px #1212170D',
};

export default function QuotationTopbarActions({ data, recordId, token, apiBaseUrl }) {
  const navigate = useNavigate();
  const ui = useUI();
  const tMenu = useMenuLabel();
  const [showSend, setShowSend] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSendToEval, setShowSendToEval] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [isCloneHovered, setIsCloneHovered] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const status = data?.documentStatus;

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

  if (!status) return null;

  return (
    <>
      <button type="button" data-testid="action-clone" onClick={() => setShowClone(true)} style={{...btnCloneStyle, background: isCloneHovered ? '#F1F5F9' : '#FFFFFF'}} title={ui('cloneOrderBtn')} onMouseEnter={() => setIsCloneHovered(true)} onMouseLeave={() => setIsCloneHovered(false)}>
        <CopyIcon />
      </button>

      <SendDocumentButton onClick={() => setShowSend(true)} />

      {showClone && createPortal(
        <CloneOrderModal
          recordId={recordId}
          data={data}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          cloneActionName="cloneRecord"
          headerEntity="quotation"
          onClose={() => setShowClone(false)}
          onCloned={(newId) => {
            setShowClone(false);
            navigate(`/sales-quotation/${newId}`);
          }}
        />,
        document.body,
      )}

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
