import { useRef, useState } from 'react';
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
  // ETP-5124 — bumped on a successful send so EmailsCard refetches instead of
  // showing its pre-send state (see InvoicePreview/OrderPreview/GoodsShipmentPreview/
  // ReturnMaterialReceiptPreview).
  const [emailsRefreshSignal, setEmailsRefreshSignal] = useState(0);

  // ETP-4315 follow-up (2026-08-18) — same tableName as attachmentConfig below; lets
  // useReturnToVendorPdf skip the jsreport round-trip and serve the marked attachment
  // directly when one already exists, instead of regenerating on every open.
  const pdfCacheConfig = { tableName: 'M_InOut', storeCondition: shipment?.documentStatus !== 'DR', recordUpdated: shipment?.updated ?? null };
  const { pdfUrl, pdfBlob, loading: pdfLoading, error: pdfError } = useReturnToVendorPdf(
    shipment?.id ?? null,
    apiBaseUrl,
    token,
    pdfCacheConfig,
  );

  if (!shipment) return null;

  // ETP-4789 — Download PDF gets its own status gate: only downloadable once
  // the return shipment is Confirmed (CO), matching the rule applied to the
  // other 5 preview panels in this bug.
  const isDownloadable = shipment.documentStatus === 'CO';
  // ETP-5124 — Send is only available once the shipment is Confirmed (CO), matching
  // the grid row quick-action's `emailAction.visibleWhen` gate in index.jsx and the
  // pattern used by every other document preview (e.g. ReturnMaterialReceiptPreview).
  const isSendable = shipment.documentStatus === 'CO';

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

  // ETP-5124 — the backend contract (`return-to-vendor-shipment-send`) now exists,
  // so this window gets the same "Enviar" button and email-history card as
  // Invoice/Order/Quotation/Goods Shipment/Return Material Receipt. The prior
  // ETP-4717 removal (contract-name mismatch — see docs/feedback.md) no longer
  // applies.
  const { actionButtons, tabs } = buildReturnPreviewContent({
    doc: shipment, pdfBlob, handleDownload, modalRef,
    specs, partnerName, movementDate, token, apiBaseUrl, ui,
    canDownload: isDownloadable,
    onEmail: isSendable ? sendModal.openEmailModal : undefined,
    emailsCard: {
      onSend: isSendable ? sendModal.openEmailModal : undefined,
      documentId: shipment.id,
      apiBaseUrl,
      refreshSignal: emailsRefreshSignal,
    },
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
        pdfBlobLoading={pdfLoading}
        onSent={() => setEmailsRefreshSignal(n => n + 1)}
        data-testid="ReceiptSendModal__93f029" />
    </>
  );
}
