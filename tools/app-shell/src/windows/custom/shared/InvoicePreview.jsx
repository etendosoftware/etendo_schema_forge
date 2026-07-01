import { useRef, useMemo } from 'react';
import { Edit2, FileText, Loader2, AlertCircle, Mail, Download, Wallet, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { useMenuLabel, useUI } from '@/i18n';
import { getLatestInstallmentDueDate } from '@/lib/invoiceDueDate';
import NewPaymentEntryModal from './NewPaymentEntryModal.jsx';
import PdfViewer from './PdfViewer.jsx';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal.jsx';
import GenericPreviewModal from './GenericPreviewModal.jsx';
import { useInvoicePreview } from './useInvoicePreview.js';
import { useFiscalStatus } from './useFiscalStatus.js';
import { StatusPill } from '@/windows/custom/fiscal-monitor/FmPrimitives.jsx';
import { getInvoiceFiscalTargets } from './fiscalTargets.js';
import SifSendingModal from './SifSendingModal.jsx';
import SummaryCard, { InfoRow } from './preview-cards/SummaryCard.jsx';
import PaymentsCard from './preview-cards/PaymentsCard.jsx';
import EmailsCard from './preview-cards/EmailsCard.jsx';
import RelatedDocumentsCard from './preview-cards/RelatedDocumentsCard.jsx';
import { fetchByCriteria, fetchById } from '@/components/related-documents';

function isCreditNote(invoice) {
  if (!invoice) return false;
  if (invoice.arInvoiceSubtype) return invoice.arInvoiceSubtype === 'NC' || invoice.arInvoiceSubtype === 'DEV';
  const ident = (invoice['transactionDocument$_identifier'] || invoice['cDocTypeTargetId$_identifier'] || '').toLowerCase();
  return ident.includes('credit') || ident.includes('memo') || ident.includes('crédito') || ident.includes('return') || ident.includes('devoluci');
}

/**
 * InvoicePreview — wires useInvoicePreview data into GenericPreviewModal.
 *
 * File persistence (drop zone + PDF caching) is delegated to GenericPreviewModal
 * via attachmentConfig. The left panel is:
 *   - sales invoice, draft:     PDF viewer (regenerated on every open)
 *   - sales invoice, completed: managed by GenericPreviewModal (cached via ETGO_PREVIEW_FILE)
 *   - purchase invoice:         managed by GenericPreviewModal (drop zone → persisted)
 */
function InvoiceActionButtons({ triggerEdit, onEmail, canSendToSif, onOpenSif, canAddPayment, onAddPayment, isSalesInvoice, onDownloadPdf, hasPdf }) {
  const ui = useUI();
  return (
    <>
      {onEmail && (
        <Button
          size="sm"
          className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-[#121217] hover:bg-[#2a2a30] text-white [&_svg]:size-5"
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
          className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-white border-[#D1D4DB] shadow-sm text-[#121217] [&_svg]:size-5"
          onClick={onOpenSif}
          data-testid="Button__cf88e6">
          <FileText className="text-[#828FA3]" data-testid="FileText__cf88e6" />
          {ui('sendToSif')}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-white border-[#D1D4DB] shadow-sm text-[#121217] disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-5"
        disabled={!canAddPayment}
        onClick={canAddPayment ? onAddPayment : undefined}
        data-testid="Button__cf88e6">
        <Wallet className="text-[#828FA3]" data-testid="Wallet__cf88e6" />
        {ui('invoicePreviewAddPayment')}
      </Button>
      {isSalesInvoice && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-white border-[#D1D4DB] shadow-sm text-[#121217] [&_svg]:size-5"
          onClick={onDownloadPdf}
          disabled={!hasPdf}
          data-testid="Button__cf88e6">
          <Download className="text-[#828FA3]" data-testid="Download__cf88e6" />
          {ui('invoicePreviewDownloadPdf')}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-white border-[#D1D4DB] shadow-sm text-[#121217] [&_svg]:size-5"
        onClick={triggerEdit}
        data-testid="Button__cf88e6">
        <Edit2 className="text-[#828FA3]" data-testid="Edit2__cf88e6" />
        {ui('invoicePreviewEdit')}
      </Button>
      <button
        type="button"
        className="w-8 h-8 flex items-center justify-center bg-white border border-[#D1D4DB] shadow-sm rounded-lg hover:bg-gray-50 transition-colors"
      >
        <MoreVertical size={20} className="text-[#828FA3]" data-testid="MoreVertical__cf88e6" />
      </button>
    </>
  );
}

// ── General tab content ───────────────────────────────────────────────────────

function InvoiceGeneralTab({ invoice, partnerName, badgeProps, statusLabel, installments, payments, loadingPayments, totalOutstanding, canAddPayment, isFullyPaid, isCreditNote: isNC, specName, apiBaseUrl, token, orgId, profile, onAddPayment, onSend }) {
  const ui = useUI();
  const fiscalTargets = getInvoiceFiscalTargets(specName, profile);
  const { sii: siiStatus, tbai: tbaiStatus, verifactu: vfStatus, loading: fiscalLoading } = useFiscalStatus(
    invoice?.id, specName, profile, apiBaseUrl, orgId,
  );
  const invoiceRelatedSpecs = useMemo(() => {
    const orderId = invoice?.salesOrder;
    if (!orderId) return [];
    return [
      { key: 'sales-order', type: 'sales-order', fetch: (_id, tok, base) => fetchById('sales-order', 'header', orderId, tok, base).then(r => r ? [r] : []) },
      { key: 'shipment',    type: 'shipment',     fetch: (_id, tok, base) => fetchByCriteria('goods-shipment', 'goodsShipment', 'salesOrder', orderId, tok, base) },
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
        data-testid="SummaryCard__cf88e6">
        {fiscalTargets.showSii && (
          <InfoRow
            label={ui('invoicePreview.fiscalStatus.sii')}
            data-testid="InfoRow__cf88e6">
            {fiscalLoading
              ? <span className="h-5 w-16 bg-gray-100 rounded animate-pulse inline-block" />
              : <StatusPill estado={siiStatus ?? 'PE'} data-testid="StatusPill__cf88e6" />}
          </InfoRow>
        )}
        {fiscalTargets.showTbai && (
          <InfoRow
            label={ui('invoicePreview.fiscalStatus.tbai')}
            data-testid="InfoRow__cf88e6">
            {fiscalLoading
              ? <span className="h-5 w-16 bg-gray-100 rounded animate-pulse inline-block" />
              : <StatusPill estado={tbaiStatus ?? 'Pendiente'} data-testid="StatusPill__cf88e6" />}
          </InfoRow>
        )}
        {fiscalTargets.showVerifactu && (
          <InfoRow
            label={ui('invoicePreview.fiscalStatus.verifactu')}
            data-testid="InfoRow__cf88e6">
            {fiscalLoading
              ? <span className="h-5 w-16 bg-gray-100 rounded animate-pulse inline-block" />
              : <StatusPill estado={vfStatus ?? 'PE'} data-testid="StatusPill__cf88e6" />}
          </InfoRow>
        )}
      </SummaryCard>
      <PaymentsCard
        payments={payments}
        currencyCode={currencyCode}
        totalOutstanding={totalOutstanding}
        canAddPayment={canAddPayment}
        isFullyPaid={isFullyPaid}
        isCreditNote={isNC}
        loading={loadingPayments}
        onAddPayment={onAddPayment}
        specName={specName}
        data-testid="PaymentsCard__cf88e6" />
      {specName !== 'purchase-invoice' && <EmailsCard onSend={onSend} data-testid="EmailsCard__cf88e6" />}
      <RelatedDocumentsCard
        documentId={invoice?.id}
        token={token}
        apiBaseUrl={apiBaseUrl}
        specs={invoiceRelatedSpecs}
        data-testid="RelatedDocumentsCard__cf88e6" />
    </div>
  );
}

function EmptyPanel({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-20">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InvoicePreview({ invoice, token, apiBaseUrl, windowName, specName = 'purchase-invoice', onClose, onEdit, onInvoiceUpdated = null }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const modalRef = useRef(null);
  const p = useInvoicePreview({ invoice, token, apiBaseUrl, specName, onInvoiceUpdated });

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
          <AlertCircle className="h-8 w-8 text-amber-400" data-testid="AlertCircle__cf88e6" />
          <p className="text-sm text-muted-foreground">{ui('invoicePdfError')}</p>
          <p className="text-xs text-muted-foreground/60">{p.pdfError}</p>
        </div>
      )}
      {p.pdfUrl && !p.pdfLoading && <PdfViewer url={p.pdfUrl} data-testid="PdfViewer__cf88e6" />}
    </div>
  ) : null;

  // ── Attachment config ──────────────────────────────────────────────────────

  const isDraft = invoice?.documentStatus === 'DR';
  const attachmentConfig = p.isSalesInvoice ? {
    documentId: invoice.id,
    specName,
    storeCondition: !isDraft,
    sourceBlob: !isDraft ? p.pdfBlob : null,
    autoFetch: true,
    token,
    apiBaseUrl,
  } : {
    documentId: invoice.id,
    specName,
    storeCondition: true,
    autoFetch: false,
    token,
    apiBaseUrl,
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
          isDraft={p.isDraft}
          isFullyPaid={p.isFullyPaid}
          isCreditNote={isCreditNote(p.displayInvoice)}
          specName={specName}
          apiBaseUrl={apiBaseUrl}
          token={token}
          orgId={p.orgId}
          profile={p.profile}
          onAddPayment={() => p.setShowPaymentModal(true)}
          onSend={p.openEmailModal}
          data-testid="InvoiceGeneralTab__cf88e6" />
      ),
    },
    {
      key: 'messages',
      label: ui('invoicePreviewMessages'),
      content: <EmptyPanel
        icon="💬"
        text={ui('invoicePreviewNoMessagesYet')}
        data-testid="EmptyPanel__cf88e6" />,
    },
    {
      key: 'history',
      label: ui('invoicePreviewHistory'),
      content: <EmptyPanel
        icon="🕐"
        text={ui('invoicePreviewNoActivityRecorded')}
        data-testid="EmptyPanel__cf88e6" />,
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  const windowLabel = tMenu(specName === 'purchase-invoice' ? 'Purchase Invoice' : 'Sales Invoice');

  const actionButtons = (
    <InvoiceActionButtons
      triggerEdit={() => modalRef.current?.triggerEdit?.()}
      onEmail={specName !== 'purchase-invoice' ? p.openEmailModal : undefined}
      canSendToSif={p.canSendToSif}
      onOpenSif={() => p.setShowSifModal(true)}
      canAddPayment={p.canAddPayment}
      onAddPayment={() => p.setShowPaymentModal(true)}
      isSalesInvoice={p.isSalesInvoice}
      onDownloadPdf={p.handleDownloadPdf}
      hasPdf={!!p.pdfUrl}
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
          outstanding={p.totalOutstanding}
          apiBaseUrl={apiBaseUrl}
          onClose={() => p.setShowPaymentModal(false)}
          onSaved={() => { p.setShowPaymentModal(false); p.fetchPayments(); }}
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
          token={token}
          pdfBlobUrl={p.pdfUrl}
          isClosing={p.sendModalClosing}
          onClose={p.closeEmailModal}
          data-testid="SendDocumentModal__cf88e6" />
      )}
    </>
  );
}
