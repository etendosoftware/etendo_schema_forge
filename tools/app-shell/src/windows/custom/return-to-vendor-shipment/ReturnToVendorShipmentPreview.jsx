import { useRef } from 'react';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';
import GenericPreviewModal from '../shared/GenericPreviewModal.jsx';
import { PreviewPdfPanel, usePreviewSendModal, ReceiptSendModal } from '../shared/PreviewActionButtons.jsx';
import { useReturnToVendorPdf } from './useReturnToVendorPdf.js';
import { downloadBlobAsFile } from '../shared/pdfUtils.js';
import { buildReturnPreviewContent } from '../shared/preview-cards/buildReturnPreviewContent.jsx';

export default function ReturnToVendorShipmentPreview({ shipment, token, apiBaseUrl, windowName, onClose, onEdit }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const modalRef = useRef(null);
  const sendModal = usePreviewSendModal();

  // ETP-4315 follow-up (2026-08-18) — same tableName as attachmentConfig below; lets
  // useReturnToVendorPdf skip the jsreport round-trip and serve the marked attachment
  // directly when one already exists, instead of regenerating on every open.
  const pdfCacheConfig = { tableName: 'M_InOut', storeCondition: shipment?.documentStatus !== 'DR', recordUpdated: shipment?.updated ?? null };
  const { pdfUrl, pdfBlob, loading: pdfLoading, error: pdfError } = useReturnToVendorPdf(
    shipment?.id ?? null,
    apiBaseUrl,
    pdfCacheConfig,
  );

  if (!shipment) return null;

  // ETP-4789 — this window has no Send action (no pre-existing isSendable to
  // reuse), so Download PDF gets its own status gate: only downloadable once
  // the return shipment is Confirmed (CO), matching the rule applied to the
  // other 5 preview panels in this bug.
  const isDownloadable = shipment.documentStatus === 'CO';

  const partnerName = shipment['businessPartner$_identifier'] || '—';
  const movementDate = shipment.movementDate ? formatCalendarDate(shipment.movementDate, locale) : '—';
  const windowLabel = tMenu('Return to Vendor Shipment');
  const isDraft = shipment.documentStatus === 'DR';

  const handleDownload = () => {
    if (!pdfBlob) return;
    downloadBlobAsFile(pdfBlob, `dev-compra-${shipment.documentNo || 'devolucion'}.pdf`);
  };

  // ETP-4315 — new wiring (this window never cached its rendered PDF before,
  // design doc Open design question 6, resolved "do it now" for consistency).
  // Real, marked Attachment (M_InOut), same draft-gated pattern as the other
  // generated-PDF windows.
  const attachmentConfig = !isDraft
    ? {
        storeCondition: true, sourceBlob: pdfBlob, autoFetch: true, recordUpdated: shipment?.updated ?? null,
        documentId: shipment.id, tableName: 'M_InOut', useMainAttachment: true, token, apiBaseUrl,
      }
    : { storeCondition: false, documentId: shipment.id, tableName: 'M_InOut', useMainAttachment: true, token, apiBaseUrl };

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

  // ETP-4717 — QA (Emilio Polliotti) rejected the ETP-4718 "Enviar" action on this
  // window: the frontend derives the email contract name as `${windowName}-send`
  // (`return-to-vendor-shipment-send`), but the backend only registers
  // `ReturnToVendorSendEmailContract.NAME` = `return-to-vendor-send`, so every click
  // fails with "Unknown email contract". QA explicitly asked to remove the action
  // from this window rather than reconcile the contract name — no `onEmail` is wired
  // to `buildReturnPreviewContent`, matching the sibling `return-material-receipt`
  // preview's pattern (see `ReturnMaterialReceiptPreview.jsx`), so the "Enviar" button
  // never renders here (`PreviewActionButtons` only shows it when `onEmail` is set).
  // `sendModal`/`ReceiptSendModal` stay wired below in case a future ticket fixes the
  // contract mismatch and re-enables Send for this window.
  const { actionButtons, tabs } = buildReturnPreviewContent({
    doc: shipment, pdfBlob, handleDownload, modalRef,
    specs, partnerName, movementDate, token, apiBaseUrl, ui,
    canDownload: isDownloadable,
  });

  return (
    <>
      <GenericPreviewModal
        ref={modalRef}
        title={`${windowLabel} ${shipment.documentNo}`}
        subtitle={partnerName !== '—' ? `${ui('returnToVendorPreviewVendor')} ${partnerName}` : undefined}
        leftPanel={leftPanel}
        attachmentConfig={attachmentConfig}
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
