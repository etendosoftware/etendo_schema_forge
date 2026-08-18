import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';
import GenericPreviewModal from '../shared/GenericPreviewModal.jsx';
import { makeStaticPreviewTabs } from '../shared/PreviewActionButtons.jsx';
import { InfoRow, PercentBar, MovementSummaryCard } from '../shared/preview-cards/SummaryCard.jsx';
import { STATUS_BADGE, STATUS_KEYS } from '@/components/related-documents/constants.jsx';
import RelatedDocumentsCard from '../shared/preview-cards/RelatedDocumentsCard.jsx';

function ReceiptStatsPanel({ receipt, partnerName, movementDate, token, apiBaseUrl, ui, onOrderClick }) {
  const invoiceStatusPct = Number(receipt.invoiceStatus ?? 0);
  const docStatus = receipt.documentStatus;
  const statusLabel = ui(STATUS_KEYS[docStatus]) || receipt['documentStatus$_identifier'] || docStatus || '—';
  const statusBadgeClass = STATUS_BADGE[docStatus] || 'bg-muted text-muted-foreground border-border-subtle';
  const purchaseOrderNo = receipt['salesOrder$_identifier'] || null;

  const specs = [
    { key: 'linkedOrders', type: 'order', fetch: async () => receipt?.linkedOrders ?? [] },
    { key: 'linkedInvoices', type: 'invoice', fetch: async () => receipt?.linkedInvoices ?? [] },
    { key: 'linkedReturns', type: 'return-to-vendor', fetch: async () => receipt?.linkedReturns ?? [] },
  ];

  const rows = [
    { label: ui('shipmentPreviewDocNo'), value: receipt.documentNo || '—' },
    { label: ui('goodsReceiptPreview.supplier'), value: partnerName },
    { label: ui('goodsReceiptPreview.warehouse'), value: receipt['warehouse$_identifier'] || '—' },
    { label: ui('goodsReceiptPreview.movementDate'), value: movementDate },
  ];

  return (
    <div className="pb-4">
      <MovementSummaryCard
        title={ui('shipmentPreviewStatus')}
        rows={rows}
        statusRowLabel={ui('shipmentPreviewStatus')}
        statusLabel={statusLabel}
        statusBadgeClass={statusBadgeClass}
        data-testid="MovementSummaryCard__ba7c74">
        <InfoRow
          label={ui('goodsReceiptPreview.originOrder')}
          data-testid="InfoRow__ba7c74">
          {purchaseOrderNo ? (
            <button
              type="button"
              onClick={onOrderClick}
              className="text-status-info-foreground font-medium text-right max-w-[55%] truncate hover:underline bg-transparent border-none p-0 cursor-pointer"
            >
              {purchaseOrderNo}
            </button>
          ) : null}
        </InfoRow>
        <InfoRow label={ui('shipmentPreviewInvoiceStatus')} data-testid="InfoRow__ba7c74">
          <PercentBar value={invoiceStatusPct} data-testid="PercentBar__ba7c74" />
        </InfoRow>
      </MovementSummaryCard>
      <RelatedDocumentsCard
        documentId={receipt.id}
        token={token}
        apiBaseUrl={apiBaseUrl}
        specs={specs}
        data-testid="RelatedDocumentsCard__ba7c74" />
    </div>
  );
}

export default function GoodsReceiptPreview({ receipt, token, apiBaseUrl, windowName, onClose, onEdit }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const navigate = useNavigate();
  const modalRef = useRef(null);

  if (!receipt) return null;

  const partnerName = receipt['businessPartner$_identifier'] || '—';
  const movementDate = receipt.movementDate
    ? formatCalendarDate(receipt.movementDate, locale)
    : '—';
  const windowLabel = tMenu('Goods Receipt');
  const purchaseOrderId = receipt.salesOrder || null;

  const actionButtons = (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-card border-[hsl(var(--border-control))] shadow-sm text-[hsl(var(--foreground))] [&_svg]:size-5"
        onClick={() => modalRef.current?.triggerEdit?.()}
        data-testid="Button__ba7c74">
        <Edit2 className="text-[hsl(var(--text-disabled))]" data-testid="Edit2__ba7c74" />
        {ui('invoicePreviewEdit')}
      </Button>
    </>
  );

  const tabs = [
    {
      key: 'general',
      label: ui('invoicePreviewGeneral'),
      content: (
        <ReceiptStatsPanel
          receipt={receipt}
          partnerName={partnerName}
          movementDate={movementDate}
          token={token}
          apiBaseUrl={apiBaseUrl}
          ui={ui}
          onOrderClick={purchaseOrderId
            ? () => { onClose?.(); navigate(`/purchase-order/${purchaseOrderId}`); }
            : undefined}
          data-testid="ReceiptStatsPanel__ba7c74" />
      ),
    },
    ...makeStaticPreviewTabs(ui),
  ];

  // ETP-4315 — real, marked Attachment shared with the "Adjuntos" tab
  // (M_InOut is the physical table for goods receipts).
  const attachmentConfig = {
    documentId: receipt.id,
    tableName: 'M_InOut',
    useMainAttachment: true,
    storeCondition: true,
    autoFetch: false,
    token,
    apiBaseUrl,
  };

  return (
    <GenericPreviewModal
      ref={modalRef}
      title={`${windowLabel} ${receipt.documentNo}`}
      subtitle={partnerName !== '—' ? `${ui('invoicePreviewClient')} ${partnerName}` : undefined}
      attachmentConfig={attachmentConfig}
      onClose={onClose}
      onEdit={() => onEdit?.(receipt.id)}
      tabs={tabs}
      actionButtons={actionButtons}
      data-testid="GenericPreviewModal__ba7c74" />
  );
}
