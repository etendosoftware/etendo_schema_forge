import { useRef } from 'react';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';
import GenericPreviewModal from '../shared/GenericPreviewModal.jsx';
import { PreviewPdfPanel, usePreviewSendModal, ReceiptSendModal } from '../shared/PreviewActionButtons.jsx';
import { useReturnToVendorPdf } from './useReturnToVendorPdf.js';
import { downloadBlobAsFile } from '../shared/pdfUtils.js';
import { buildReturnPreviewContent } from '../shared/preview-cards/buildReturnPreviewContent.jsx';

// ETP-4718 — the "Enviar" (send-email) action is only meaningful once the document
// is Confirmado; Borrador (and any other non-final state) has nothing to send yet.
const SENDABLE_STATUS = 'CO';

export default function ReturnToVendorShipmentPreview({ shipment, token, apiBaseUrl, windowName, onClose, onEdit }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const modalRef = useRef(null);
  const sendModal = usePreviewSendModal();

  const { pdfUrl, pdfBlob, loading: pdfLoading, error: pdfError } = useReturnToVendorPdf(
    shipment?.id ?? null,
    apiBaseUrl,
    token,
  );

  if (!shipment) return null;

  const partnerName = shipment['businessPartner$_identifier'] || '—';
  const movementDate = shipment.movementDate ? formatCalendarDate(shipment.movementDate, locale) : '—';
  const windowLabel = tMenu('Return to Vendor Shipment');
  const isSendable = shipment.documentStatus === SENDABLE_STATUS;

  const handleDownload = () => {
    if (!pdfBlob) return;
    downloadBlobAsFile(pdfBlob, `dev-compra-${shipment.documentNo || 'devolucion'}.pdf`);
  };

  const specs = [
    { key: 'sourceReceipts', type: 'goods-receipt', fetch: async () => shipment?.sourceReceipts ?? [] },
    { key: 'returnInvoices', type: 'purchase-invoice', fetch: async () => shipment?.returnInvoices ?? [] },
  ];

  const leftPanel = (
    <PreviewPdfPanel
      pdfLoading={pdfLoading}
      pdfError={pdfError}
      pdfUrl={pdfUrl}
      generatingText={ui('returnToVendorPdfGenerating')}
      errorText={ui('returnToVendorPdfError')}
      data-testid="PreviewPdfPanel__93f029" />
  );

  const { actionButtons, tabs } = buildReturnPreviewContent({
    doc: shipment, pdfBlob, handleDownload, modalRef,
    specs, partnerName, movementDate, token, apiBaseUrl, ui,
    onEmail: isSendable ? sendModal.openEmailModal : undefined,
  });

  return (
    <>
      <GenericPreviewModal
        ref={modalRef}
        title={`${windowLabel} ${shipment.documentNo}`}
        subtitle={partnerName !== '—' ? `${ui('returnToVendorPreviewVendor')} ${partnerName}` : undefined}
        leftPanel={leftPanel}
        onClose={onClose}
        onEdit={() => onEdit?.(shipment.id)}
        tabs={tabs}
        actionButtons={actionButtons}
        data-testid="GenericPreviewModal__93f029" />
      <ReceiptSendModal
        sendModal={sendModal}
        documentType={windowLabel}
        receipt={shipment}
        partnerName={partnerName}
        apiBaseUrl={apiBaseUrl}
        token={token}
        windowName={windowName}
        pdfBlobUrl={pdfUrl}
        data-testid="ReceiptSendModal__93f029" />
    </>
  );
}
