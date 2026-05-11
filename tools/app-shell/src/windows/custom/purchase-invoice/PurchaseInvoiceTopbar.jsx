import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import SendToSifButton from '../shared/SendToSifButton.jsx';
import InvoicePaymentModal from '../shared/InvoicePaymentModal.jsx';
import CloneButton from '../shared/CloneButton.jsx';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency';

export default function PurchaseInvoiceTopbar({ data, recordId, token, apiBaseUrl, onRefresh }) {
  const navigate = useNavigate();
  const ui = useUI();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showClone, setShowClone] = useState(false);

  useEffect(() => {
    const handleInvoiceUpdated = (event) => {
      if (String(event.detail?.invoiceId) !== String(recordId)) return;
      window.location.reload();
    };

    window.addEventListener('purchase-invoice:invoice-updated', handleInvoiceUpdated);
    return () => window.removeEventListener('purchase-invoice:invoice-updated', handleInvoiceUpdated);
  }, [recordId]);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

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
      {recordId && (
        <>
          <CloneButton onClick={() => setShowClone(true)} title={ui('cloneOrderBtn')} />
          <SendToSifButton
            data={data}
            recordId={recordId}
            token={token}
            apiBaseUrl={apiBaseUrl}
            status={data?.documentStatus}
          />
          {showClone && createPortal(
            <CloneOrderModal
              recordId={recordId}
              data={data}
              apiBaseUrl={apiBaseUrl}
              headers={headers}
              cloneActionName="cloneRecord"
              titleKey="cloneInvoiceConfirmTitle"
              bodyKey="cloneInvoiceConfirmBody"
              actionLabelKey="cloneInvoiceAction"
              errorKey="cloneInvoiceError"
              processingKey="invoiceProcessing"
              onClose={() => setShowClone(false)}
              onCloned={(newId) => {
                setShowClone(false);
                navigate(`/purchase-invoice/${newId}`);
              }}
            />,
            document.body,
          )}
        </>
      )}
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
            <span className="font-semibold tabular-nums">{formatCurrency(currency || 'USD', totalPaid)}</span>
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
            <span className="font-semibold tabular-nums">{formatCurrency(currency || 'USD', outstanding)}</span>
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
