import { useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Edit2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';
import GenericPreviewModal from '../shared/GenericPreviewModal.jsx';
import { PreviewPdfPanel } from '../shared/PreviewActionButtons.jsx';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal.jsx';
import { useShipmentPdf } from './useShipmentPdf.js';
import { STATUS_BADGE, STATUS_KEYS } from '@/components/related-documents/constants.jsx';
import { InfoRow, CardShell, PercentBar } from '../shared/preview-cards/SummaryCard.jsx';
import EmailsCard from '../shared/preview-cards/EmailsCard.jsx';
import RelatedDocumentsCard from '../shared/preview-cards/RelatedDocumentsCard.jsx';

// ── Tab content components ────────────────────────────────────────────────────

function ShipmentStatsPanel({ shipment, partnerName, movementDate, ui }) {
  const invoiceStatusPct = Number(shipment.invoiceStatus ?? 0);
  const warehouseLabel = shipment['warehouse$_identifier'] || '—';
  const docStatus = shipment.documentStatus;
  const statusLabel = ui(STATUS_KEYS[docStatus]) || shipment['documentStatus$_identifier'] || docStatus || '—';
  const statusBadgeClass = STATUS_BADGE[docStatus] || 'bg-muted text-muted-foreground border-border-subtle';

  return (
    <CardShell data-testid="CardShell__5d626b">
      <div className="px-4 py-3 border-b border-border-subtle">
        <span className="font-bold text-foreground text-sm">{ui('shipmentPreviewStatus')}</span>
      </div>
      <div className="px-4 py-2">
        <InfoRow
          label={ui('shipmentPreviewDocNo')}
          value={shipment.documentNo || '—'}
          data-testid="InfoRow__5d626b" />
        <InfoRow
          label={ui('shipmentPreviewContact')}
          value={partnerName}
          data-testid="InfoRow__5d626b" />
        <InfoRow
          label={ui('shipmentPreviewWarehouse')}
          value={warehouseLabel}
          data-testid="InfoRow__5d626b" />
        <InfoRow
          label={ui('shipmentPreviewDate')}
          value={movementDate}
          data-testid="InfoRow__5d626b" />
        <InfoRow label={ui('shipmentPreviewStatus')} data-testid="InfoRow__5d626b">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass}`}>
            {statusLabel}
          </span>
        </InfoRow>
        <InfoRow label={ui('shipmentPreviewInvoiceStatus')} data-testid="InfoRow__5d626b">
          <PercentBar value={invoiceStatusPct} data-testid="PercentBar__5d626b" />
        </InfoRow>
      </div>
    </CardShell>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GoodsShipmentPreview({ shipment, token, apiBaseUrl, windowName, onClose, onEdit }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const navigate = useNavigate();
  const modalRef = useRef(null);

  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalClosing, setSendModalClosing] = useState(false);
  const openEmailModal = useCallback(() => setShowSendModal(true), []);
  const closeEmailModal = useCallback(() => {
    setSendModalClosing(true);
    setTimeout(() => { setSendModalClosing(false); setShowSendModal(false); }, 280);
  }, []);

  // ETP-4315 follow-up (2026-08-18) — same tableName as attachmentConfig below; lets
  // useShipmentPdf skip the jsreport round-trip and serve the marked attachment
  // directly when one already exists, instead of regenerating on every open.
  const pdfCacheConfig = { tableName: 'M_InOut', storeCondition: shipment?.documentStatus !== 'DR' };
  const { pdfUrl, pdfBlob, loading: pdfLoading, error: pdfError } = useShipmentPdf(
    shipment?.id ?? null,
    apiBaseUrl,
    token,
    pdfCacheConfig,
  );

  // Fetch the full header record once; all 3 specs share 1 HTTP call via the cached promise.
  const shipmentDocSpecs = useMemo(() => {
    let detailPromise = null;
    const getDetail = (id, tok, base) => {
      if (!detailPromise) {
        detailPromise = fetch(`${base}/goodsShipment/${id}`, {
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        })
          .then(r => r.ok ? r.json() : null)
          .then(j => j?.response?.data?.[0] ?? {})
          .catch(() => ({}));
      }
      return detailPromise;
    };
    return [
      { key: 'orders',   type: 'sales-order',            fetch: (id, tok, base) => getDetail(id, tok, base).then(r => r.linkedOrders   ?? []) },
      { key: 'invoices', type: 'sales-invoice',           fetch: (id, tok, base) => getDetail(id, tok, base).then(r => r.linkedInvoices ?? []) },
      { key: 'returns',  type: 'return-material-receipt', fetch: (id, tok, base) => getDetail(id, tok, base).then(r => r.returnReceipts ?? []) },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment?.id]);

  if (!shipment) return null;

  // ETP-4717 — Send is only available once the shipment is Confirmed (CO),
  // matching the Grid row quick-action and Form-view topbar gates.
  const isSendable = shipment.documentStatus === 'CO';
  const isDraft = shipment.documentStatus === 'DR';

  // ── Left panel ──────────────────────────────────────────────────────────────

  const leftPanel = (
    <PreviewPdfPanel
      pdfLoading={pdfLoading}
      pdfError={pdfError}
      pdfUrl={pdfUrl}
      generatingText={ui('shipmentPdfGenerating')}
      errorText={ui('shipmentPdfError')}
      data-testid="PreviewPdfPanel__5d626b" />
  );

  // ── Attachment config ───────────────────────────────────────────────────────

  // ETP-4315 — new wiring (this window never cached its rendered PDF before,
  // design doc Open design question 6, resolved "do it now" for consistency).
  // Real, marked Attachment (M_InOut), same draft-gated pattern as the other
  // generated-PDF windows (sales-invoice/order/quotation).
  const attachmentConfig = !isDraft
    ? {
        storeCondition: true, sourceBlob: pdfBlob, autoFetch: true,
        documentId: shipment.id, tableName: 'M_InOut', useMainAttachment: true, token, apiBaseUrl,
      }
    : { storeCondition: false, documentId: shipment.id, tableName: 'M_InOut', useMainAttachment: true, token, apiBaseUrl };

  // ── Derived values ──────────────────────────────────────────────────────────

  const partnerName = shipment['businessPartner$_identifier'] || '—';
  const movementDate = shipment.movementDate
    ? formatCalendarDate(shipment.movementDate, locale)
    : '—';
  const windowLabel = tMenu('Goods Shipment');

  // ── Action buttons ──────────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!pdfBlob) return;
    const a = document.createElement('a');
    const url = URL.createObjectURL(pdfBlob);
    a.href = url;
    a.download = `alb-${shipment.documentNo || 'albaran'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const actionButtons = (
    <>
      {isSendable && (
        <Button
          size="sm"
          className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground))] text-primary-foreground [&_svg]:size-5"
          onClick={openEmailModal}
          data-testid="Button__5d626b">
          <Mail data-testid="Mail__5d626b" />
          {ui('invoicePreviewSend')}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-card border-[hsl(var(--border-control))] shadow-sm text-[hsl(var(--foreground))] disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-5"
        disabled={!pdfBlob || !isSendable}
        onClick={pdfBlob && isSendable ? handleDownload : undefined}
        data-testid="Button__5d626b">
        <Download className="text-[hsl(var(--text-disabled))]" data-testid="Download__5d626b" />
        {ui('invoicePreviewDownloadPdf')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-card border-[hsl(var(--border-control))] shadow-sm text-[hsl(var(--foreground))] [&_svg]:size-5"
        onClick={() => modalRef.current?.triggerEdit?.()}
        data-testid="Button__5d626b">
        <Edit2 className="text-[hsl(var(--text-disabled))]" data-testid="Edit2__5d626b" />
        {ui('invoicePreviewEdit')}
      </Button>
    </>
  );

  // ── Tabs ────────────────────────────────────────────────────────────────────

  const tabs = [
    {
      key: 'general',
      label: ui('invoicePreviewGeneral'),
      content: (
        <div className="pb-4">
          <ShipmentStatsPanel
            shipment={shipment}
            partnerName={partnerName}
            movementDate={movementDate}
            ui={ui}
            data-testid="ShipmentStatsPanel__5d626b" />
          <EmailsCard onSend={isSendable ? openEmailModal : undefined} data-testid="EmailsCard__5d626b" />
          <RelatedDocumentsCard
            documentId={shipment.id}
            token={token}
            apiBaseUrl={apiBaseUrl}
            specs={shipmentDocSpecs}
            data-testid="RelatedDocumentsCard__5d626b" />
        </div>
      ),
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <GenericPreviewModal
        ref={modalRef}
        title={`${windowLabel} ${shipment.documentNo}`}
        subtitle={partnerName !== '—' ? `${ui('invoicePreviewClient')} ${partnerName}` : undefined}
        leftPanel={leftPanel}
        attachmentConfig={attachmentConfig}
        onClose={onClose}
        onEdit={() => onEdit?.(shipment.id)}
        tabs={tabs}
        actionButtons={actionButtons}
        data-testid="GenericPreviewModal__5d626b" />
      {showSendModal && (
        <SendDocumentModal
          documentType={windowLabel}
          documentNo={shipment.documentNo}
          bpName={partnerName}
          bPartnerId={shipment.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={shipment.id}
          windowName="goods-shipment"
          token={token}
          pdfBlobUrl={pdfUrl}
          isClosing={sendModalClosing}
          onClose={closeEmailModal}
          data-testid="SendDocumentModal__5d626b" />
      )}
    </>
  );
}
