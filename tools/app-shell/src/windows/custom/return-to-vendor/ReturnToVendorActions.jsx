import { useState } from 'react';
import { createPortal } from 'react-dom';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import { useMenuLabel } from '@/i18n';
import { useReturnToVendorOrderPdf } from './useReturnToVendorOrderPdf.js';

/* eslint-disable react/prop-types */

/**
 * Form-view topbar action for the return-to-vendor window: the "Send document"
 * envelope that opens SendDocumentModal WITH the same client-rendered PDF
 * preview used by the side-panel preview.
 *
 * Mirrors QuotationTopbarActions (ETP-4372). The PDF hook is called
 * unconditionally at the top level (rules of hooks).
 */
export default function ReturnToVendorActions({ data, recordId, token, apiBaseUrl }) {
  const tMenu = useMenuLabel();
  const [showSend, setShowSend] = useState(false);

  const { pdfUrl, loading: pdfLoading } = useReturnToVendorOrderPdf(recordId, apiBaseUrl, token);

  const status = data?.documentStatus;
  if (!status) return null;

  return (
    <>
      <SendDocumentButton
        onClick={() => setShowSend(true)}
        data-testid="SendDocumentButton__90f3f6" />
      {showSend && createPortal(
        <SendDocumentModal
          documentType={tMenu('Return to Vendor')}
          documentNo={data?.documentNo}
          bpName={data?.['businessPartner$_identifier']}
          bPartnerId={data?.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={recordId}
          windowName="return-to-vendor"
          token={token}
          pdfBlobUrl={pdfUrl}
          pdfBlobLoading={pdfLoading}
          onClose={() => setShowSend(false)}
          data-testid="SendDocumentModal__rtv-topbar" />,
        document.body,
      )}
    </>
  );
}
