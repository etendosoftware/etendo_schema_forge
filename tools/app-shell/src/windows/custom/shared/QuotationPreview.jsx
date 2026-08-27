import { useRef, useState } from 'react';
import { useLocale, useMenuLabel, useUI } from '@/i18n';
import { statusLabel as resolveStatusLabel } from '@/lib/statusBadge.js';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal.jsx';
import GenericPreviewModal from './GenericPreviewModal.jsx';
import { useQuotationPdf } from './useQuotationPdf.js';
import { useDocumentCurrency } from './useDocumentCurrency.js';
import PreviewActionButtons, { PreviewPdfPanel } from './PreviewActionButtons.jsx';
import SummaryCard from './preview-cards/SummaryCard.jsx';
import EmailsCard from './preview-cards/EmailsCard.jsx';
import RelatedDocumentsCard from './preview-cards/RelatedDocumentsCard.jsx';
import { fetchByCriteria } from '@/components/related-documents';
import { useCurrencyPrecision } from '@/hooks/useCurrencyPrecision.js';

// ── Quotation related-documents specs ────────────────────────────────────────

const QUOTATION_SPECS = [
  { key: 'sales-order', type: 'sales-order', fetch: (id, token, base) => fetchByCriteria('sales-order', 'header', 'quotation', id, token, base) },
];

// Statuses that mean the quotation is no longer editable

// ── General tab content ───────────────────────────────────────────────────────

function QuotationGeneralTab({ quotation, onSend, token, apiBaseUrl, orgCurrencyCode, exchangeRate, orgGrandTotal, ratePrecision }) {
  const ui = useUI();
  // Pass the DB-sourced status dictionary (same one DataTable.jsx uses via
  // useLocale()) so this preview resolves the exact same "Bajo evaluación"
  // AD_Ref_List_Trl label the grid shows, instead of falling back to the
  // generic statusUnderEvaluation ("En evaluación") key.
  const dictionary = useLocale();
  const statusCode = quotation.documentStatus;
  const statusLabel = resolveStatusLabel(statusCode, dictionary, ui);

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
        ratePrecision={ratePrecision}
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
  // ETP-4789 (reject-cycle fix): see OrderPreview.jsx — the cached attachment
  // (GET /preview-file) resolves ahead of the jsreport regeneration below;
  // capturing it here lets Download gate on whichever source resolves first.
  const [cachedAttachment, setCachedAttachment] = useState(null);

  const ratePrecision = useCurrencyPrecision();

  // Dual-currency: fetch system exchange rate, then override with per-quotation rate when set.
  // eTGOCurrencyRate = org→doc multiplyRate (e.g. 1.20 = "1 EUR = 1.20 USD").
  // orgGrandTotal = docTotal / eTGOCurrencyRate converts doc→org correctly.
  const { orgCurrencyCode, isSameCurrency, exchangeRate: systemExchangeRate } = useDocumentCurrency({
    docCurrencyCode: quotation?.['currency$_identifier'],
    orderDate: quotation?.orderDate,
    apiBaseUrl,
    token,
  });
  const etgoRate = (!isSameCurrency && quotation?.eTGOCurrencyRate)
    ? parseFloat(quotation.eTGOCurrencyRate)
    : null;
  const exchangeRate = (etgoRate && etgoRate !== 0 && etgoRate !== 1)
    ? etgoRate
    : systemExchangeRate;
  const orgGrandTotal = (!isSameCurrency && exchangeRate && quotation?.grandTotalAmount != null)
    ? Number(quotation.grandTotalAmount) / exchangeRate
    : null;
  const currencyData = { orgCurrencyCode, exchangeRate };

  // ETP-4315 follow-up (2026-08-18) — same tableName as attachmentConfig below; lets
  // useQuotationPdf skip the jsreport round-trip and serve the marked attachment
  // directly when one already exists, instead of regenerating on every open.
  const pdfCacheConfig = { tableName: 'C_Order', storeCondition: quotation?.documentStatus !== 'DR', recordUpdated: quotation?.updated ?? null };
  const { pdfUrl, pdfBlob, loading: pdfLoading, error: pdfError } = useQuotationPdf(
    quotation?.id,
    apiBaseUrl,
    token,
    currencyData,
    pdfCacheConfig,
  );

  if (!quotation) return null;

  const isDraft = quotation.documentStatus === 'DR';
  // ETP-4717 — Send is available from "Bajo evaluación" (UE) onward, not
  // while still Draft (DR). Matches the Grid row quick-action and Form-view
  // topbar gates.
  const isSendable = quotation.documentStatus !== 'DR';

  const openEmailModal = () => {
    setSendModalClosing(false);
    setShowSendModal(true);
  };
  const closeEmailModal = () => {
    setSendModalClosing(true);
    setTimeout(() => setShowSendModal(false), 300);
  };

  // Prefer the cached attachment when available — already fetched, resolves
  // ahead of the jsreport regeneration and closes the preview/button gap.
  const hasPdf = !!pdfUrl || !!cachedAttachment;

  const handleDownloadPdf = () => {
    if (cachedAttachment) {
      const a = document.createElement('a');
      a.href = cachedAttachment.objectUrl;
      a.download = cachedAttachment.fileName || `quotation-${quotation.documentNo || quotation.id}.pdf`;
      a.click();
      return;
    }
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

  // ETP-4315 — real, marked Attachment (C_Order is sales-quotation's physical
  // table too, shared with sales-order/purchase-order).
  const attachmentConfig = !isDraft
    ? {
        storeCondition: true,
        sourceBlob: pdfBlob,
        autoFetch: true,
        recordUpdated: quotation?.updated ?? null,
        documentId: quotation.id,
        tableName: 'C_Order',
        token,
        apiBaseUrl,
        onFileChange: setCachedAttachment,
      }
    : {
        storeCondition: false,
        documentId: quotation.id,
        tableName: 'C_Order',
        token,
        apiBaseUrl,
        onFileChange: setCachedAttachment,
      };

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const tabs = [
    {
      key: 'general',
      label: ui('quotationPreviewGeneral'),
      content: <QuotationGeneralTab
        quotation={quotation}
        onSend={isSendable ? openEmailModal : undefined}
        token={token}
        apiBaseUrl={apiBaseUrl}
        orgCurrencyCode={orgCurrencyCode}
        exchangeRate={exchangeRate}
        orgGrandTotal={orgGrandTotal}
        ratePrecision={ratePrecision}
        data-testid="QuotationGeneralTab__7eb018" />,
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  const windowLabel = tMenu('Sales Quotation');
  const partnerName = quotation.businessPartner$_identifier;

  const actionButtons = (
    <PreviewActionButtons
      triggerEdit={() => modalRef.current?.triggerEdit?.()}
      onEmail={isSendable ? openEmailModal : undefined}
      onDownloadPdf={isSendable ? handleDownloadPdf : undefined}
      hasPdf={hasPdf}
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
          pdfBlobLoading={pdfLoading}
          isClosing={sendModalClosing}
          onClose={closeEmailModal}
          data-testid="SendDocumentModal__7eb018" />
      )}
    </>
  );
}
