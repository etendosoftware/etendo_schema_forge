import { useState } from 'react';
import DocumentStatusPill from '@/components/contract-ui/DocumentStatusPill.jsx';
import InvoicePaymentModal from '../shared/InvoicePaymentModal.jsx';
import { useUI } from '@/i18n';

function fmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return curr ? `${s} ${curr}` : s;
}

export default function PurchaseInvoiceTopbar({ data, token, apiBaseUrl, onRefresh }) {
  const ui = useUI();
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  if (!data) return null;

  const docStatus = data.documentStatus;
  const currency = data['currency$_identifier'] || '';
  const grandTotal = data.grandTotalAmount ?? 0;
  const outstanding = data.outstandingAmount ?? grandTotal;
  const totalPaid = grandTotal - outstanding;
  const isFullyPaid = data.paymentComplete === true || data.paymentComplete === 'Y' || outstanding <= 0;
  const isCompleted = docStatus === 'CO';

  const handleBadgeClick = () => {
    if (isCompleted) setShowPaymentModal(true);
  };

  const handleModalClose = () => {
    setShowPaymentModal(false);
    onRefresh?.();
  };

  return (
    <>
      <DocumentStatusPill data={data} />

      {/* Payment Status pill — only show for completed invoices */}
      {isCompleted && (
        isFullyPaid ? (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#d1fae5', color: '#065f46', cursor: 'pointer' }}
            onClick={handleBadgeClick}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10b981' }} />
            {ui('statusPaid')}
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span className="font-semibold tabular-nums">{fmt(totalPaid, currency)}</span>
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#fef3c7', color: '#78350f', cursor: 'pointer' }}
            onClick={handleBadgeClick}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#f59e0b' }} />
            {ui('statusPending')}
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span className="font-semibold tabular-nums">{fmt(outstanding, currency)}</span>
          </span>
        )
      )}

      {showPaymentModal && (
        <InvoicePaymentModal
          invoiceId={data.id}
          invoiceData={data}
          specName="purchase-invoice"
          token={token}
          apiBaseUrl={apiBaseUrl}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}
