import { useRef } from 'react';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';
import GenericPreviewModal from '../shared/GenericPreviewModal.jsx';
import { usePreviewSendModal, ReceiptSendModal } from '../shared/PreviewActionButtons.jsx';
import { useReturnReceiptPdf } from './useReturnReceiptPdf.js';
import { downloadBlobAsFile } from '../shared/pdfUtils.js';
import { buildReturnPreviewContent } from '../shared/preview-cards/buildReturnPreviewContent.jsx';

export default function ReturnMaterialReceiptPreview({ receipt, token, apiBaseUrl, windowName, onClose, onEdit }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const modalRef = useRef(null);

  const sendModal = usePreviewSendModal();

  // Still generated for the "Enviar"/"Descargar PDF" actions (our own record of the
  // receipt). The left panel itself no longer auto-shows it — see attachmentConfig below.
  const { pdfUrl, pdfBlob } = useReturnReceiptPdf(
    receipt?.id ?? null,
    apiBaseUrl,
    token,
  );

  if (!receipt) return null;

  const partnerName = receipt['businessPartner$_identifier'] || '—';
  const movementDate = receipt.movementDate ? formatCalendarDate(receipt.movementDate, locale) : '—';
  const windowLabel = tMenu('Return Material Receipt');

  const handleDownload = () => {
    if (!pdfBlob) return;
    downloadBlobAsFile(pdfBlob, `dev-${receipt.documentNo || 'devolucion'}.pdf`);
  };

  const specs = [
    { key: 'sourceShipments', type: 'shipment', fetch: async () => receipt?.sourceShipments ?? [] },
    { key: 'returnInvoices', type: 'sales-invoice', fetch: async () => receipt?.returnInvoices ?? [] },
  ];

  // Left panel is the customer-supplied return receipt (optional — the customer may
  // not issue or provide one). Replaces the system-generated PDF that used to render
  // here; that PDF is still available via the "Enviar"/"Descargar PDF" actions.
  const attachmentConfig = {
    documentId: receipt.id,
    specName: 'return-material-receipt',
    storeCondition: true,
    autoFetch: false,
    token,
    apiBaseUrl,
  };

  const { actionButtons, tabs } = buildReturnPreviewContent({
    doc: receipt, pdfBlob, handleDownload, modalRef,
    specs, partnerName, movementDate, token, apiBaseUrl, ui,
  });

  return (
    <>
      <GenericPreviewModal
        ref={modalRef}
        title={`${windowLabel} ${receipt.documentNo}`}
        subtitle={partnerName !== '—' ? `${ui('invoicePreviewClient')} ${partnerName}` : undefined}
        attachmentConfig={attachmentConfig}
        onClose={onClose}
        onEdit={() => onEdit?.(receipt.id)}
        tabs={tabs}
        actionButtons={actionButtons}
        data-testid="GenericPreviewModal__178845" />
      <ReceiptSendModal
        sendModal={sendModal}
        documentType={windowLabel}
        receipt={receipt}
        partnerName={partnerName}
        apiBaseUrl={apiBaseUrl}
        token={token}
        windowName="return-material-receipt"
        pdfBlobUrl={pdfUrl}
        data-testid="ReceiptSendModal__178845" />
    </>
  );
}
