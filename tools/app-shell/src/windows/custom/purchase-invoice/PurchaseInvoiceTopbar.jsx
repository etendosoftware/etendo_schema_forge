import { useState } from 'react';
import InvoicePaymentHistoryModal from '@/windows/custom/shared/InvoicePaymentHistoryModal.jsx';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency';
import { useInvoiceUpdatedListener } from '../shared/useInvoiceUpdatedListener.js';
import { resolveInvoicePaymentBadge } from '@/windows/custom/shared/invoicePaymentBadge.js';

// ETP-5260 — Clone/SendToSif/Copy-link moved to the topbarSecondary slot
// (PurchaseInvoiceSecondaryActions). This component now only renders the
// payment-status badge (a primary/status indicator that belongs at the
// extreme right, after Save/Confirm) and its modal.
export default function PurchaseInvoiceTopbar({ data, recordId, apiBaseUrl, onRefresh }) {
  const ui = useUI();
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useInvoiceUpdatedListener('purchase-invoice', recordId, onRefresh);

  if (!data) return null;

  const docStatus = data.documentStatus;
  const currency = data['currency$_identifier'] || '';
  const grandTotal = data.grandTotalAmount ?? 0;
  const outstanding = data.outstandingAmount ?? grandTotal;
  const totalPaid = grandTotal - outstanding;
  const isCompleted = docStatus === 'CO';
  // ETP-4841: payment state follows the SIGN of the total, not the document type —
  // a POSITIVE Factura Rectificativa is payable and a NEGATIVE ordinary Factura is
  // a credit. Shared with both grids via resolveInvoicePaymentBadge.
  const badge = resolveInvoicePaymentBadge(data);
  // `paymentComplete` still wins for ordinary invoices: Etendo can mark an invoice
  // settled without the outstanding reaching exactly zero.
  const isFullyPaid = !badge.isCredit
    && (data.paymentComplete === true || data.paymentComplete === 'Y' || badge.kind === 'paid');

  const handleBadgeClick = () => {
    if (isCompleted) setShowPaymentModal(true);
  };

  const handleModalClose = () => {
    setShowPaymentModal(false);
    onRefresh?.();
  };

  return (
    <>
      {isCompleted && (() => {
        if (badge.isCredit) {
          // Mirror the grid's "Saldo pendiente" cell for credit instruments: green
          // "Aplicada" once fully consumed, else a clickable "Saldo a favor · remaining"
          // badge that opens the same history modal (listing the payments that consumed it).
          if (badge.kind === 'credit-applied') {
            return (
              <span
                className="inline-flex items-center gap-1.5 text-[13px] font-medium"
                style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success-fg)' }}
              >
                {ui('cpCreditFullyApplied')}
              </span>
            );
          }
          return (
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info-fg)', cursor: 'pointer' }}
              data-testid="payment-status-badge"
              onClick={handleBadgeClick}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--status-info-fg)' }} />
              {ui('cpFavorBadge')}
              <span style={{ opacity: 0.4 }}>&middot;</span>
              <span className="font-semibold tabular-nums">{formatCurrency(currency || 'USD', badge.amount)}</span>
            </span>
          );
        }
        if (isFullyPaid) {
          return (
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success-fg)', cursor: 'pointer' }}
              data-testid="payment-status-badge"
            onClick={handleBadgeClick}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--status-success-fg)' }} />
              {ui('statusPaid')}
              <span style={{ opacity: 0.4 }}>&middot;</span>
              <span className="font-semibold tabular-nums">{formatCurrency(currency || 'USD', totalPaid)}</span>
            </span>
          );
        }
        return (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', cursor: 'pointer' }}
            data-testid="payment-status-badge"
            onClick={handleBadgeClick}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--status-warning-fg)' }} />
            {ui('statusPending')}
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span className="font-semibold tabular-nums">{formatCurrency(currency || 'USD', badge.amount)}</span>
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
