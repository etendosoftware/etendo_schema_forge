import { useState, useRef } from 'react';
import { useMenuLabel, useUI } from '@/i18n';
import { statusLabel as resolveStatusLabel } from '@/lib/statusBadge.js';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal.jsx';
import GenericPreviewModal from '../shared/GenericPreviewModal.jsx';
import PreviewActionButtons, { PreviewEmptyPanel, PreviewPdfPanel } from '../shared/PreviewActionButtons.jsx';
import SummaryCard from '../shared/preview-cards/SummaryCard.jsx';
import EmailsCard from '../shared/preview-cards/EmailsCard.jsx';
import { useReturnToVendorOrderPdf } from './useReturnToVendorOrderPdf.js';

/* eslint-disable react/prop-types */

// ── General tab content ───────────────────────────────────────────────────────

function ReturnToVendorGeneralTab({ order, onSend }) {
  const ui = useUI();
  const statusCode = order.documentStatus;
  const statusLabel = resolveStatusLabel(statusCode, null, ui);

  return (
    <div className="pb-4">
      <SummaryCard
        currencyCode={order['currency$_identifier'] ?? ''}
        grandTotal={order.grandTotalAmount}
        contact={order.businessPartner$_identifier}
        date={order.orderDate}
        statusCode={statusCode}
        statusLabel={statusLabel}
        data-testid="SummaryCard__rtv" />
      <EmailsCard onSend={onSend} data-testid="EmailsCard__rtv" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Dedicated side-panel preview for the return-to-vendor window. Mirrors
 * OrderPreview but scoped to this C_Order purchase-return spec so the shared
 * OrderPreview (used by sales-order / purchase-order) is not modified.
 */
export default function ReturnToVendorPreview({ order, token, apiBaseUrl, windowName, onClose, onEdit }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const modalRef = useRef(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalClosing, setSendModalClosing] = useState(false);

  const isDraft = order?.documentStatus === 'DR';

  const { pdfUrl, pdfBlob, loading: pdfLoading, error: pdfError } =
    useReturnToVendorOrderPdf(order?.id ?? null, apiBaseUrl, token);

  const windowLabel = tMenu('Return to Vendor');

  // Email-modal helpers must be defined before the tabs array so onSend is available.
  const openEmailModal = () => {
    setSendModalClosing(false);
    setShowSendModal(true);
  };
  const closeEmailModal = () => {
    setSendModalClosing(true);
    setTimeout(() => { setShowSendModal(false); setSendModalClosing(false); }, 300);
  };

  if (!order) return null;

  // ── Left panel ──────────────────────────────────────────────────────────────

  const leftPanel = (
    <PreviewPdfPanel
      pdfLoading={pdfLoading}
      pdfError={pdfError}
      pdfUrl={pdfUrl}
      generatingText={ui('purchaseOrderPdfGenerating')}
      errorText={ui('purchaseOrderPdfError')}
      data-testid="PreviewPdfPanel__rtv" />
  );

  // ── Attachment config ───────────────────────────────────────────────────────

  const attachmentConfig = !isDraft
    ? { storeCondition: true, sourceBlob: pdfBlob, autoFetch: true, documentId: order.id, specName: windowName, token, apiBaseUrl }
    : { storeCondition: false, documentId: order.id, specName: windowName, token, apiBaseUrl };

  // ── Tabs ────────────────────────────────────────────────────────────────────

  const tabs = [
    {
      key: 'general',
      label: ui('orderPreviewGeneral'),
      content: <ReturnToVendorGeneralTab
        order={order}
        onSend={openEmailModal}
        data-testid="ReturnToVendorGeneralTab__rtv" />,
    },
    {
      key: 'messages',
      label: ui('orderPreviewMessages'),
      content: <PreviewEmptyPanel icon="💬" text={ui('orderPreviewMessages')} data-testid="PreviewEmptyPanel__rtv" />,
    },
    {
      key: 'history',
      label: ui('orderPreviewHistory'),
      content: <PreviewEmptyPanel icon="🕐" text={ui('orderPreviewHistory')} data-testid="PreviewEmptyPanel__rtv" />,
    },
  ];

  const handleDownloadPdf = () => {
    if (!pdfBlob) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${order.documentNo || 'return-to-vendor'}.pdf`;
    a.click();
  };

  const actionButtons = (
    <PreviewActionButtons
      triggerEdit={() => modalRef.current?.triggerEdit?.()}
      onEmail={openEmailModal}
      onDownloadPdf={handleDownloadPdf}
      hasPdf={!!pdfUrl}
      sendLabel={ui('orderPreviewSend')}
      downloadLabel={ui('orderPreviewDownloadPdf')}
      editLabel={ui('orderPreviewEdit')}
      data-testid="PreviewActionButtons__rtv" />
  );

  return (
    <>
      <GenericPreviewModal
        ref={modalRef}
        title={`${windowLabel} ${order.documentNo}`}
        subtitle={order.businessPartner$_identifier
          ? `${ui('orderPreviewContact')} ${order.businessPartner$_identifier}`
          : undefined}
        leftPanel={leftPanel}
        attachmentConfig={attachmentConfig}
        onClose={onClose}
        onEdit={() => onEdit?.(order.id)}
        tabs={tabs}
        actionButtons={actionButtons}
        data-testid="GenericPreviewModal__rtv" />
      {showSendModal && (
        <SendDocumentModal
          documentType={windowLabel}
          documentNo={order.documentNo}
          bpName={order.businessPartner$_identifier}
          bPartnerId={order.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={order.id}
          windowName={windowName}
          token={token}
          pdfBlobUrl={pdfUrl}
          isClosing={sendModalClosing}
          onClose={closeEmailModal}
          data-testid="SendDocumentModal__rtv-preview" />
      )}
    </>
  );
}
