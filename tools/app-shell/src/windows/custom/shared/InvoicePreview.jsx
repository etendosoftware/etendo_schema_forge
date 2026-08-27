import { useRef, useMemo, useState } from 'react';
import { Edit2, FileText, Loader2, AlertCircle, Mail, Download, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { useMenuLabel, useUI } from '@/i18n';
import { getLatestInstallmentDueDate } from '@/lib/invoiceDueDate';
import NewPaymentEntryModal from './NewPaymentEntryModal.jsx';
import PdfViewer from './PdfViewer.jsx';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal.jsx';
import GenericPreviewModal from './GenericPreviewModal.jsx';
import { useInvoicePreview } from './useInvoicePreview.js';
import { resolveInvoicePaymentBadge } from './invoicePaymentBadge.js';
import { useFiscalStatus } from './useFiscalStatus.js';
import { StatusPill } from '@/windows/custom/fiscal-monitor/FmPrimitives.jsx';
import { getInvoiceFiscalTargets } from './fiscalTargets.js';
import SifSendingModal from './SifSendingModal.jsx';
import SummaryCard, { InfoRow } from './preview-cards/SummaryCard.jsx';
import PaymentsCard from './preview-cards/PaymentsCard.jsx';
import EmailsCard from './preview-cards/EmailsCard.jsx';
import RelatedDocumentsCard from './preview-cards/RelatedDocumentsCard.jsx';
import { fetchByCriteria, fetchById } from '@/components/related-documents';
import { useDocumentCurrency, resolveDualCurrencyDisplay } from './useDocumentCurrency.js';
import { useCurrencyPrecision } from '@/hooks/useCurrencyPrecision.js';

// ETP-4841: a credit instrument is identified by the SIGN of its total, not by its
// document type. This used to compare `arInvoiceSubtype` against the pre-ETP-4737
// values 'NC'/'DEV', which no longer exist — the check was silently always false and
// fell through to keyword matching on the document-type name.
function isCreditNote(invoice) {
  if (!invoice) return false;
  return resolveInvoicePaymentBadge(invoice).isCredit;
}

/**
 * InvoicePreview — wires useInvoicePreview data into GenericPreviewModal.
 *
 * File persistence (drop zone + PDF caching) is delegated to GenericPreviewModal
 * via attachmentConfig. The left panel is:
 *   - sales invoice, draft:     PDF viewer (regenerated on every open)
 *   - sales invoice, completed: managed by GenericPreviewModal (cached as a marked Attachment)
 *   - purchase invoice:         managed by GenericPreviewModal (drop zone → persisted)
 */
function InvoiceActionButtons({ triggerEdit, onEmail, canSendToSif, onOpenSif, canAddPayment, addPaymentBlockedByDraft, onAddPayment, isSalesInvoice, onDownloadPdf, hasPdf }) {
  const ui = useUI();
  return (
    <>
      {onEmail && (
        <Button
          size="sm"
          className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground [&_svg]:size-5"
          onClick={onEmail}
          data-testid="Button__cf88e6">
          <Mail data-testid="Mail__cf88e6" />
          {ui('invoicePreviewSend')}
        </Button>
      )}
      {canSendToSif && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-card border-border shadow-sm text-foreground [&_svg]:size-5"
          onClick={onOpenSif}
          data-testid="Button__cf88e6">
          <FileText className="text-muted-foreground" data-testid="FileText__cf88e6" />
          {ui('sendToSif')}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-card border-border shadow-sm text-foreground disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-5"
        disabled={!canAddPayment}
        onClick={canAddPayment ? onAddPayment : undefined}
        title={addPaymentBlockedByDraft ? ui('cpAddPaymentBlockedByDraft') : undefined}
        data-testid="Button__cf88e6">
        <Wallet className="text-muted-foreground" data-testid="Wallet__cf88e6" />
        {ui('invoicePreviewAddPayment')}
      </Button>
      {isSalesInvoice && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-card border-border shadow-sm text-foreground disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-5"
          onClick={hasPdf && onDownloadPdf ? onDownloadPdf : undefined}
          disabled={!hasPdf || !onDownloadPdf}
          data-testid="Button__cf88e6">
          <Download className="text-muted-foreground" data-testid="Download__cf88e6" />
          {ui('invoicePreviewDownloadPdf')}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-card border-border shadow-sm text-foreground [&_svg]:size-5"
        onClick={triggerEdit}
        data-testid="Button__cf88e6">
        <Edit2 className="text-muted-foreground" data-testid="Edit2__cf88e6" />
        {ui('invoicePreviewEdit')}
      </Button>
    </>
  );
}

// ── General tab content ───────────────────────────────────────────────────────

function InvoiceGeneralTab({ invoice, partnerName, badgeProps, statusLabel, installments, payments, loadingPayments, totalOutstanding, canAddPayment, addPaymentBlockedByDraft, isFullyPaid, isCreditNote: isNC, specName, apiBaseUrl, token, orgId, profile, onAddPayment, onSend, orgCurrencyCode, exchangeRate, orgGrandTotal, ratePrecision }) {
  const ui = useUI();
  const fiscalTargets = getInvoiceFiscalTargets(specName, profile);
  const { sii: siiStatus, tbai: tbaiStatus, verifactu: vfStatus, loading: fiscalLoading } = useFiscalStatus(
    invoice?.id, specName, profile, apiBaseUrl, orgId,
  );
  const invoiceRelatedSpecs = useMemo(() => {
    const orderId = invoice?.salesOrder;
    if (!orderId) return [];
    return [
      { key: 'sales-order', type: 'sales-order', fetch: (_id, base) => fetchById('sales-order', 'header', orderId, base).then(r => r ? [r] : []) },
      { key: 'shipment',    type: 'shipment',     fetch: (_id, base) => fetchByCriteria('goods-shipment', 'goodsShipment', 'salesOrder', orderId, base) },
    ];
  }, [invoice?.salesOrder]);


  const latestDueDate = getLatestInstallmentDueDate(installments);
  const currencyCode = installments[0]?.['currency$_identifier'] || invoice?.['currency$_identifier'] || '';

  return (
    <div className="pb-4">
      <SummaryCard
        currencyCode={currencyCode}
        grandTotal={invoice?.grandTotalAmount}
        contact={partnerName}
        date={invoice?.invoiceDate}
        dueDate={latestDueDate ?? null}
        statusCode={invoice?.documentStatus}
        statusLabel={statusLabel}
        orgCurrencyCode={orgCurrencyCode}
        exchangeRate={exchangeRate}
        orgGrandTotal={orgGrandTotal}
        ratePrecision={ratePrecision}
        data-testid="SummaryCard__cf88e6">
        {fiscalTargets.showSii && (
          <InfoRow
            label={ui('invoicePreview.fiscalStatus.sii')}
            data-testid="InfoRow__cf88e6">
            {fiscalLoading
              ? <span className="h-5 w-16 bg-muted rounded animate-pulse inline-block" />
              : <StatusPill estado={siiStatus ?? 'PE'} data-testid="StatusPill__cf88e6" />}
          </InfoRow>
        )}
        {fiscalTargets.showTbai && (
          <InfoRow
            label={ui('invoicePreview.fiscalStatus.tbai')}
            data-testid="InfoRow__cf88e6">
            {fiscalLoading
              ? <span className="h-5 w-16 bg-muted rounded animate-pulse inline-block" />
              : <StatusPill estado={tbaiStatus ?? 'Pendiente'} data-testid="StatusPill__cf88e6" />}
          </InfoRow>
        )}
        {fiscalTargets.showVerifactu && (
          <InfoRow
            label={ui('invoicePreview.fiscalStatus.verifactu')}
            data-testid="InfoRow__cf88e6">
            {fiscalLoading
              ? <span className="h-5 w-16 bg-muted rounded animate-pulse inline-block" />
              : <StatusPill estado={vfStatus ?? 'PE'} data-testid="StatusPill__cf88e6" />}
          </InfoRow>
        )}
      </SummaryCard>
      <PaymentsCard
        payments={payments}
        currencyCode={currencyCode}
        totalOutstanding={totalOutstanding}
        canAddPayment={canAddPayment}
        addPaymentBlockedByDraft={addPaymentBlockedByDraft}
        isFullyPaid={isFullyPaid}
        isCreditNote={isNC}
        loading={loadingPayments}
        onAddPayment={onAddPayment}
        specName={specName}
        data-testid="PaymentsCard__cf88e6" />
      {specName !== 'purchase-invoice' && <EmailsCard onSend={onSend} data-testid="EmailsCard__cf88e6" />}
      <RelatedDocumentsCard
        documentId={invoice?.id}
        apiBaseUrl={apiBaseUrl}
        specs={invoiceRelatedSpecs}
        data-testid="RelatedDocumentsCard__cf88e6" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InvoicePreview({ invoice, token, apiBaseUrl, windowName, specName = 'purchase-invoice', onClose, onEdit, onInvoiceUpdated = null }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const modalRef = useRef(null);
  const p = useInvoicePreview({ invoice, token, apiBaseUrl, specName, onInvoiceUpdated });
  const ratePrecision = useCurrencyPrecision();
  // ETP-4789 (reject-cycle fix): see OrderPreview.jsx — the cached attachment
  // (GET /preview-file) resolves ahead of the jsreport regeneration behind
  // p.pdfUrl; capturing it here lets Download gate on whichever resolves first.
  const [cachedAttachment, setCachedAttachment] = useState(null);

  // Dual-currency: fetch exchange rate when doc currency differs from org currency.
  // When the invoice has a per-document custom rate (eTGOCurrencyRate = org→doc multiplyRate,
  // e.g. 1.20 means 1 EUR = 1.20 USD), use it directly instead of the system C_Conversion_Rate.
  // This mirrors the pattern already used by OrderPreview.jsx / QuotationPreview.jsx.
  const { orgCurrencyCode, isSameCurrency, exchangeRate: systemExchangeRate } = useDocumentCurrency({
    docCurrencyCode: p.displayInvoice?.['currency$_identifier'],
    orderDate: p.displayInvoice?.invoiceDate,
    apiBaseUrl,
  });
  const { exchangeRate, orgGrandTotal } = resolveDualCurrencyDisplay({
    record: p.displayInvoice,
    isSameCurrency,
    systemExchangeRate,
  });

  if (!invoice) return null;

  // ── Left panel ─────────────────────────────────────────────────────────────

  const leftPanel = p.isSalesInvoice ? (
    <div className="flex flex-col h-full min-h-0 w-full overflow-hidden">
      {p.pdfLoading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__cf88e6" />
          <span className="text-sm">{ui('invoicePdfGenerating')}</span>
        </div>
      )}
      {p.pdfError && !p.pdfLoading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertCircle className="h-8 w-8 text-status-warning-foreground" data-testid="AlertCircle__cf88e6" />
          <p className="text-sm text-muted-foreground">{ui('invoicePdfError')}</p>
          <p className="text-xs text-muted-foreground/60">{p.pdfError}</p>
        </div>
      )}
      {p.pdfUrl && !p.pdfLoading && <PdfViewer url={p.pdfUrl} data-testid="PdfViewer__cf88e6" />}
    </div>
  ) : null;

  // ── Attachment config ──────────────────────────────────────────────────────

  const isDraft = invoice?.documentStatus === 'DR';
  // ETP-4717 — Send is only available once the invoice is Confirmed (CO),
  // matching the Grid row quick-action and Form-view topbar gates. The
  // existing purchase-invoice exclusion stays: this window never sends email.
  const isSendable = specName !== 'purchase-invoice' && invoice?.documentStatus === 'CO';
  // ETP-4315 — real, marked Attachment (C_Invoice, shared with purchase-invoice
  // below). Draft gate unchanged.
  const attachmentConfig = p.isSalesInvoice ? {
    documentId: invoice.id,
    tableName: 'C_Invoice',
    storeCondition: !isDraft,
    // ETP-4787 — a cached rendering older than the invoice's last edit is discarded and
    // overwritten by this fresh pdfBlob. The purchase branch below deliberately omits it:
    // that slot holds the supplier's OWN document, which no edit of ours makes stale.
    recordUpdated: invoice?.updated ?? null,
    sourceBlob: !isDraft ? p.pdfBlob : null,
    autoFetch: true,
    token,
    apiBaseUrl,
    onFileChange: setCachedAttachment,
  } : {
    // ETP-4315 — real, marked Attachment shared with OcrSidePanel/"Adjuntos".
    // C_Invoice is the physical table for both sales and purchase invoices;
    // this branch only runs for purchase. A purchase invoice has no generated
    // report, so its document slot holds the supplier's own document (the OCR
    // source) — unlike the sales branch above, which caches something we
    // generated ourselves and nobody attached.
    documentId: invoice.id,
    tableName: 'C_Invoice',
    storeCondition: true,
    autoFetch: false,
    token,
    apiBaseUrl,
    onFileChange: setCachedAttachment,
  };

  // Prefer the cached attachment when available — already fetched, resolves
  // ahead of the jsreport regeneration and closes the preview/button gap.
  const hasPdf = !!p.pdfUrl || !!cachedAttachment;

  const handleDownloadPdf = () => {
    if (cachedAttachment) {
      const a = document.createElement('a');
      a.href = cachedAttachment.objectUrl;
      a.download = cachedAttachment.fileName || `invoice-${p.displayInvoice?.documentNo || 'document'}.pdf`;
      a.click();
      return;
    }
    p.handleDownloadPdf();
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const tabs = [
    {
      key: 'general',
      label: ui('invoicePreviewGeneral'),
      content: (
        <InvoiceGeneralTab
          invoice={p.displayInvoice}
          partnerName={p.partnerName}
          badgeProps={p.badgeProps}
          statusLabel={p.statusLabel}
          installments={p.installments}
          payments={p.payments}
          loadingPayments={p.loadingPayments}
          totalOutstanding={p.totalOutstanding}
          canAddPayment={p.canAddPayment}
          addPaymentBlockedByDraft={p.addPaymentBlockedByDraft}
          isDraft={p.isDraft}
          isFullyPaid={p.isFullyPaid}
          isCreditNote={isCreditNote(p.displayInvoice)}
          specName={specName}
          apiBaseUrl={apiBaseUrl}
          token={token}
          orgId={p.orgId}
          profile={p.profile}
          onAddPayment={() => p.setShowPaymentModal(true)}
          onSend={isSendable ? p.openEmailModal : undefined}
          orgCurrencyCode={orgCurrencyCode}
          exchangeRate={exchangeRate}
          orgGrandTotal={orgGrandTotal}
          ratePrecision={ratePrecision}
          data-testid="InvoiceGeneralTab__cf88e6" />
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  const windowLabel = tMenu(specName === 'purchase-invoice' ? 'Purchase Invoice' : 'Sales Invoice');

  const actionButtons = (
    <InvoiceActionButtons
      triggerEdit={() => modalRef.current?.triggerEdit?.()}
      onEmail={isSendable ? p.openEmailModal : undefined}
      canSendToSif={p.canSendToSif}
      onOpenSif={() => p.setShowSifModal(true)}
      canAddPayment={p.canAddPayment}
      addPaymentBlockedByDraft={p.addPaymentBlockedByDraft}
      onAddPayment={() => p.setShowPaymentModal(true)}
      isSalesInvoice={p.isSalesInvoice}
      onDownloadPdf={isSendable ? handleDownloadPdf : undefined}
      hasPdf={hasPdf}
      data-testid="InvoiceActionButtons__cf88e6" />
  );

  return (
    <>
      <GenericPreviewModal
        ref={modalRef}
        title={`${windowLabel} ${p.displayInvoice?.documentNo}`}
        subtitle={p.partnerName !== '—' ? `${ui('invoicePreviewClient')} ${p.partnerName}` : undefined}
        leftPanel={leftPanel}
        attachmentConfig={attachmentConfig}
        onClose={onClose}
        onEdit={() => onEdit?.(p.displayInvoice?.id)}
        tabs={tabs}
        actionButtons={actionButtons}
        data-testid="GenericPreviewModal__cf88e6" />
      {p.showPaymentModal && (
        <NewPaymentEntryModal
          dir={specName === 'sales-invoice' ? 'in' : 'out'}
          specName={specName}
          invoiceId={p.displayInvoice?.id}
          invoiceData={p.displayInvoice}
          outstanding={p.freeToAllocate}
          apiBaseUrl={apiBaseUrl}
          onClose={() => p.setShowPaymentModal(false)}
          onSaved={async () => {
            p.setShowPaymentModal(false);
            // ETP-4832: refetchInvoice is what dispatches the invoice-updated event /
            // calls onInvoiceUpdated, which is what tells the hosting list view to
            // refresh the grid row — fetchPayments alone only updates this panel's
            // own PaymentsCard, mirrors the working SifSendingModal.onAfterSend pattern below.
            await p.refetchInvoice();
            p.fetchPayments();
          }}
          data-testid="NewPaymentEntryModal__cf88e6" />
      )}
      {p.showSifModal && (
        <SifSendingModal
          pendingTargets={p.pendingTargets}
          bodyKey={p.sifBodyKey}
          base={p.sifBase}
          specName={specName}
          recordId={p.displayInvoice?.id}
          onClose={p.closeSifModal}
          onAfterSend={async (next) => {
            if (Object.values(next).some((r) => r?.ok)) {
              await p.refetchInvoice();
              p.fetchPayments();
            }
          }}
          zIndex={70}
          titleId="sif-modal-title"
          data-testid="SifSendingModal__cf88e6" />
      )}
      {p.showSendModal && (
        <SendDocumentModal
          documentType={windowLabel}
          documentNo={p.displayInvoice?.documentNo}
          bpName={p.partnerName}
          bPartnerId={p.displayInvoice?.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={p.displayInvoice?.id}
          windowName={specName}
          pdfBlobUrl={p.pdfUrl}
          isClosing={p.sendModalClosing}
          onClose={p.closeEmailModal}
          data-testid="SendDocumentModal__cf88e6" />
      )}
    </>
  );
}
