import { useState } from 'react';
import { createPortal } from 'react-dom';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import QuotationConfirmModal from './QuotationConfirmModal';
import { useUI } from '@/i18n';

export default function QuotationTopbarActions({ data, recordId, token, apiBaseUrl }) {
  const ui = useUI();
  const [showSend, setShowSend] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const isDraft = data?.documentStatus === 'DR';

  if (!data?.documentStatus) return null;

  return (
    <>
      {isDraft && (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
          style={{
            padding: '4px 14px', borderRadius: 6, border: 'none',
            background: '#185FA5', color: '#fff', fontWeight: 500, cursor: 'pointer',
          }}
        >
          {ui('soConfirmBtn')}
        </button>
      )}

      <SendDocumentButton onClick={() => setShowSend(true)} />

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
          documentType="Quotation"
          documentNo={data?.documentNo}
          bpName={data?.['businessPartner$_identifier']}
          bpEmail={data?.['userContact$_identifier']}
          documentId={recordId}
          windowName="sales-quotation"
          token={token}
          onClose={() => setShowSend(false)}
        />,
        document.body,
      )}
    </>
  );
}
