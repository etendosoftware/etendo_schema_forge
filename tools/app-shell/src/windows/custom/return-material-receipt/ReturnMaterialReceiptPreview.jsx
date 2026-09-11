import { useRef } from 'react';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';
import GenericPreviewModal from '../shared/GenericPreviewModal.jsx';
import { PreviewPdfPanel, usePreviewSendModal, ReceiptSendModal } from '../shared/PreviewActionButtons.jsx';
import { useReturnReceiptPdf } from './useReturnReceiptPdf.js';
import { downloadBlobAsFile } from '../shared/pdfUtils.js';
import { buildReturnPreviewContent } from '../shared/preview-cards/buildReturnPreviewContent.jsx';

export default function ReturnMaterialReceiptPreview({ receipt, token, apiBaseUrl, windowName, onClose, onEdit }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const modalRef = useRef(null);

  const sendModal = usePreviewSendModal();

  // ETP-5124 — PM-confirmed requirement (Valeria, with Emilio Polliotti): the preview's
  // left panel must show the Etendo-generated PDF by default, the same as every other
  // document window. ETP-4408 had replaced it with the customer's own uploaded receipt,
  // which QA (Isaías) rejected — the customer document is not a substitute for the
  // Etendo-issued proof of return, it is supplementary evidence attached for
  // traceability via the generic Attachments tab instead (see decisions.json / the
  // Attachments tab restored by commit 63204c7f4, unaffected by this change).
  const { pdfUrl, pdfBlob, loading: pdfLoading, error: pdfError } = useReturnReceiptPdf(
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

  // ETP-5124 — restored: the left panel shows the system-generated PDF, same as
  // sales-invoice/goods-shipment. NOTE: deliberately NOT wired to `attachmentConfig`
  // (no auto-store of this rendered PDF as the record's marked M_InOut attachment,
  // unlike the sibling `return-to-vendor-shipment`/`goods-shipment`). Under the
  // ETP-4408 behavior being reverted here, that exact marked-attachment slot could
  // have been populated with a customer-supplied file on any record touched since
  // 2026-07-06 — enabling the read-side cache now would risk serving that stale
  // customer document back as if it were a cached Etendo PDF. Revisit once a data
  // check confirms no pre-existing customer uploads occupy that slot for this window.
  const leftPanel = (
    <PreviewPdfPanel
      pdfLoading={pdfLoading}
      pdfError={pdfError}
      pdfUrl={pdfUrl}
      generatingText={ui('returnReceiptPdfGenerating')}
      errorText={ui('returnReceiptPdfError')}
      data-testid="PreviewPdfPanel__178845" />
  );

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
        leftPanel={leftPanel}
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
