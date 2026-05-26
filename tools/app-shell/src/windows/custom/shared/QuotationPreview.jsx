import { useRef, useState } from 'react';
import { useMenuLabel, useUI } from '@/i18n';
import { statusLabel as resolveStatusLabel } from '@/lib/statusBadge.js';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal.jsx';
import GenericPreviewModal from './GenericPreviewModal.jsx';
import { useQuotationPdf } from './useQuotationPdf.js';
import { useDocumentCurrency } from './useDocumentCurrency.js';
import PreviewActionButtons, { PreviewEmptyPanel, PreviewPdfPanel } from './PreviewActionButtons.jsx';
import SummaryCard from './preview-cards/SummaryCard.jsx';
import EmailsCard from './preview-cards/EmailsCard.jsx';
import RelatedDocumentsCard from './preview-cards/RelatedDocumentsCard.jsx';
import { fetchByCriteria } from '@/components/related-documents';

// ── Quotation related-documents specs ────────────────────────────────────────

const QUOTATION_SPECS = [
  { key: 'sales-order', type: 'sales-order', fetch: (id, token, base) => fetchByCriteria('sales-order', 'header', 'quotation', id, token, base) },
];

// Statuses that mean the quotation is no longer editable

// ── General tab content ───────────────────────────────────────────────────────

function QuotationGeneralTab({ quotation, onSend, token, apiBaseUrl, orgCurrencyCode, exchangeRate, orgGrandTotal }) {
  const ui = useUI();
  const statusCode = quotation.documentStatus;
  const statusLabel = resolveStatusLabel(statusCode, null, ui);

  return (
    <div className="pb-4">
      <SummaryCard
        currencyCode={quotation['currency$_identifier'] ?? ''}
        grandTotal={quotation.grandTotalAmount}
        contact={quotation.businessPartner$_identifier}
        date={quotation.orderDate}
        statusCode={statusCode}
        statusLabel={statusLabel}
        validUntil={quotation.validUntil || null}
        orgCurrencyCode={orgCurrencyCode}
        exchangeRate={exchangeRate}
        orgGrandTotal={orgGrandTotal}
        data-testid="SummaryCard__7eb018" />
      <EmailsCard onSend={onSend} data-testid="EmailsCard__7eb018" />
      <RelatedDocumentsCard
        documentId={quotation.id}
        token={token}
        apiBaseUrl={apiBaseUrl}
        specs={QUOTATION_SPECS}
        data-testid="RelatedDocumentsCard__7eb018" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QuotationPreview({ quotation, token, apiBaseUrl, windowName, onClose, onEdit }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const modalRef = useRef(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalClosing, setSendModalClosing] = useState(false);

  // Dual-currency: fetch exchange rate when doc currency differs from org currency
  const { orgCurrencyCode, exchangeRate, convertAmount } = useDocumentCurrency({
    docCurrencyId: quotation?.['currency$_identifier'],
    orderDate: quotation?.orderDate,
    apiBaseUrl,
    token,
  });
  const orgGrandTotal = convertAmount(quotation?.grandTotalAmount);
  const currencyData = { orgCurrencyCode, exchangeRate };

  const { pdfUrl, pdfBlob, loading: pdfLoading, error: pdfError } = useQuotationPdf(
    quotation?.id,
    apiBaseUrl,
    token,
    currencyData,
  );

  if (!quotation) return null;

  const isDraft = quotation.documentStatus === 'DR';

  const openEmailModal = () => {
    setSendModalClosing(false);
    setShowSendModal(true);
  };
  const closeEmailModal = () => {
    setSendModalClosing(true);
    setTimeout(() => setShowSendModal(false), 300);
  };

  const handleDownloadPdf = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `quotation-${quotation.documentNo || quotation.id}.pdf`;
    a.click();
  };

  // ── Left panel ──────────────────────────────────────────────────────────────

  const leftPanel = (
    <PreviewPdfPanel
      pdfLoading={pdfLoading}
      pdfError={pdfError}
      pdfUrl={pdfUrl}
      generatingText={ui('quotationPdfGenerating')}
      errorText={ui('quotationPdfError')}
      data-testid="PreviewPdfPanel__7eb018" />
  );

  // ── Attachment config ───────────────────────────────────────────────────────

  const attachmentConfig = !isDraft
    ? {
        storeCondition: true,
        sourceBlob: pdfBlob,
        autoFetch: true,
        documentId: quotation.id,
        specName: 'sales-quotation',
        token,
        apiBaseUrl,
      }
    : {
        storeCondition: false,
        documentId: quotation.id,
        specName: 'sales-quotation',
        token,
        apiBaseUrl,
      };

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const tabs = [
    {
      key: 'general',
      label: ui('quotationPreviewGeneral'),
      content: <QuotationGeneralTab
        quotation={quotation}
        onSend={openEmailModal}
        token={token}
        apiBaseUrl={apiBaseUrl}
        orgCurrencyCode={orgCurrencyCode}
        exchangeRate={exchangeRate}
        orgGrandTotal={orgGrandTotal}
        data-testid="QuotationGeneralTab__7eb018" />,
    },
    {
      key: 'messages',
      label: ui('quotationPreviewMessages'),
      content: <PreviewEmptyPanel
        icon="💬"
        text={ui('quotationPreviewMessages')}
        data-testid="PreviewEmptyPanel__7eb018" />,
    },
    {
      key: 'history',
      label: ui('quotationPreviewHistory'),
      content: <PreviewEmptyPanel
        icon="🕐"
        text={ui('quotationPreviewHistory')}
        data-testid="PreviewEmptyPanel__7eb018" />,
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  const windowLabel = tMenu('Sales Quotation');
  const partnerName = quotation.businessPartner$_identifier;

  const actionButtons = (
    <PreviewActionButtons
      triggerEdit={() => modalRef.current?.triggerEdit?.()}
      onEmail={openEmailModal}
      onDownloadPdf={handleDownloadPdf}
      hasPdf={!!pdfUrl}
      sendLabel={ui('quotationPreviewSend')}
      downloadLabel={ui('quotationPreviewDownloadPdf')}
      editLabel={ui('quotationPreviewEdit')}
      data-testid="PreviewActionButtons__7eb018" />
  );

  return (
    <>
      <GenericPreviewModal
        ref={modalRef}
        title={`${windowLabel} ${quotation.documentNo}`}
        subtitle={partnerName ? `${ui('quotationPreviewContact')} ${partnerName}` : undefined}
        leftPanel={leftPanel}
        attachmentConfig={attachmentConfig}
        onClose={onClose}
        onEdit={() => onEdit?.(quotation.id)}
        tabs={tabs}
        actionButtons={actionButtons}
        data-testid="GenericPreviewModal__7eb018" />
      {showSendModal && (
        <SendDocumentModal
          documentType={windowLabel}
          documentNo={quotation.documentNo}
          bpName={partnerName}
          bPartnerId={quotation.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={quotation.id}
          windowName={windowName}
          token={token}
          pdfBlobUrl={pdfUrl}
          isClosing={sendModalClosing}
          onClose={closeEmailModal}
          data-testid="SendDocumentModal__7eb018" />
      )}
    </>
  );
}
