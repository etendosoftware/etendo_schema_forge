import RelatedDocumentsCard from './RelatedDocumentsCard.jsx';
import { STATUS_BADGE, STATUS_KEYS } from '@/components/related-documents/constants.jsx';
import { MovementSummaryCard } from './SummaryCard.jsx';

export default function ReturnDocStatsPanel({ doc, partnerName, movementDate, token, apiBaseUrl, ui, specs }) {
  const docStatus = doc.documentStatus;
  const statusLabel = ui(STATUS_KEYS[docStatus]) || doc['documentStatus$_identifier'] || docStatus || '—';
  const statusBadgeClass = STATUS_BADGE[docStatus] || 'bg-gray-50 text-gray-600 border-gray-200';

  const rows = [
    { label: ui('shipmentPreviewDocNo'), value: doc.documentNo || '—' },
    { label: ui('shipmentPreviewContact'), value: partnerName },
    { label: ui('shipmentPreviewWarehouse'), value: doc['warehouse$_identifier'] || '—' },
    { label: ui('shipmentPreviewDate'), value: movementDate },
  ];

  return (
    <div className="pb-4">
      <MovementSummaryCard
        title={ui('shipmentPreviewStatus')}
        rows={rows}
        statusRowLabel={ui('shipmentPreviewStatus')}
        statusLabel={statusLabel}
        statusBadgeClass={statusBadgeClass}
        data-testid="MovementSummaryCard__2cd27e" />
      <RelatedDocumentsCard
        documentId={doc.id}
        token={token}
        apiBaseUrl={apiBaseUrl}
        specs={specs}
        data-testid="RelatedDocumentsCard__2cd27e" />
    </div>
  );
}
