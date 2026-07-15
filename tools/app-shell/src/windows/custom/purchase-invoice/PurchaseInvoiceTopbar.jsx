import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import SendToSifButton from '../shared/SendToSifButton.jsx';
import InvoicePaymentHistoryModal from '@/windows/custom/shared/InvoicePaymentHistoryModal.jsx';
import CloneButton from '../shared/CloneButton.jsx';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency';
import { useInvoiceUpdatedListener } from '../shared/useInvoiceUpdatedListener.js';

export default function PurchaseInvoiceTopbar({ data, recordId, token, apiBaseUrl, onProcess, onRefresh }) {
  const navigate = useNavigate();
  const ui = useUI();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showClone, setShowClone] = useState(false);

  useInvoiceUpdatedListener('purchase-invoice', recordId, onRefresh);

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
  const docType = data['transactionDocument$_identifier'];
  const isCreditType = docType === 'Nota de Crédito' || docType === 'AP CreditMemo';

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
          <CloneButton
            onClick={() => setShowClone(true)}
            title={ui('cloneOrderBtn')}
            data-testid="CloneButton__8addd1" />
          <SendToSifButton
            data={data}
            recordId={recordId}
            apiBaseUrl={apiBaseUrl}
            status={data?.documentStatus}
            data-testid="SendToSifButton__8addd1" />
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
              data-testid="CloneOrderModal__8addd1" />,
            document.body,
          )}
        </>
      )}
      {isCompleted && (() => {
        if (isCreditType) {
          // Mirror the grid's "Pendiente de pago" cell for credit notes: green "Aplicada"
          // once fully consumed, else a purple clickable "Saldo a favor · remaining" badge
          // that opens the same history modal (listing the payments that consumed the note).
          const outstandingAbs = Math.abs(parseFloat(outstanding) || 0);
          if (outstandingAbs < 0.001) {
            return (
              <span
                className="inline-flex items-center gap-1.5 text-[13px] font-medium"
                style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#d1fae5', color: '#065f46' }}
              >
                {ui('cpCreditFullyApplied')}
              </span>
            );
          }
          return (
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#ede9fe', color: '#4c1d95', cursor: 'pointer' }}
              data-testid="payment-status-badge"
              onClick={handleBadgeClick}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#7c3aed' }} />
              {ui('cpFavorBadge')}
              <span style={{ opacity: 0.4 }}>&middot;</span>
              <span className="font-semibold tabular-nums">{formatCurrency(currency || 'USD', outstandingAbs)}</span>
            </span>
          );
        }
        if (isFullyPaid) {
          return (
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#d1fae5', color: '#065f46', cursor: 'pointer' }}
              data-testid="payment-status-badge"
            onClick={handleBadgeClick}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10b981' }} />
              {ui('statusPaid')}
              <span style={{ opacity: 0.4 }}>&middot;</span>
              <span className="font-semibold tabular-nums">{formatCurrency(currency || 'USD', totalPaid)}</span>
            </span>
          );
        }
        return (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: '#fef3c7', color: '#78350f', cursor: 'pointer' }}
            data-testid="payment-status-badge"
            onClick={handleBadgeClick}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#f59e0b' }} />
            {ui('statusPending')}
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span className="font-semibold tabular-nums">{formatCurrency(currency || 'USD', outstanding)}</span>
          </span>
        );
      })()}
      {showPaymentModal && (
        <InvoicePaymentHistoryModal
          invoiceId={data.id}
          invoiceData={data}
          specName="purchase-invoice"
          apiBaseUrl={apiBaseUrl}
          onClose={handleModalClose}
          onPaymentAdded={handleModalClose}
          data-testid="InvoicePaymentHistoryModal__8addd1" />
      )}
    </>
  );
}
