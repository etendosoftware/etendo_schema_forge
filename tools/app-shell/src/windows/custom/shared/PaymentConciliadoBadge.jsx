import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useUI } from '@/i18n';

/* eslint-disable react/prop-types */

// Matches Classic's reconciliation model: only RPPC ("Payment Cleared") means
// the payment has actually been matched/cleared against a bank statement.
// Every other status (RPR "Payment Received", PPM "Payment Made", RDNC
// "Deposited not Cleared", PWNC "Withdrawn not Cleared", RPAE "Awaiting
// Execution") is money that has moved but not yet been bank-reconciled — same
// distinction financial-account/movementStatusConfig.js already draws.
const RECONCILED_STATUS = 'RPPC';

const CHECK_ICON = (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const BADGE_STYLE = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 8px', borderRadius: 360,
  background: 'var(--status-success-bg)', color: 'var(--status-success-fg)',
  fontFamily: 'Inter', fontWeight: 600, fontSize: 14, lineHeight: '20px',
  whiteSpace: 'nowrap',
};

// Interactive resets on top of BADGE_STYLE for the clickable (<button>) variant —
// the static (<span>) variant never carries these.
const BADGE_BUTTON_STYLE = { ...BADGE_STYLE, border: 'none', cursor: 'pointer' };

export default function PaymentConciliadoBadge({ data }) {
  const ui = useUI();
  const navigate = useNavigate();
  if (data?.status !== RECONCILED_STATUS) return null;

  // ETP-4479: once the payment is reconciled, navigate to the bank transaction it
  // was matched against (FIN_Finacc_Transaction.Fin_Payment_ID → this payment).
  // Both financialTransactionId (injected by ReactivatePaymentHandler.afterHandle)
  // and account (Fin_Financial_Account_ID, already on the header contract) are
  // required to build the deep link — fall back to the static, non-clickable pill
  // when either is missing (e.g. older backend not yet redeployed) rather than
  // rendering a broken link.
  const transactionId = data?.financialTransactionId;
  const accountId = data?.account;

  if (!transactionId || !accountId) {
    return (
      <span style={BADGE_STYLE}>
        {CHECK_ICON}
        {ui('conciliado')}
      </span>
    );
  }

  const goToTransaction = () => {
    navigate(`/financial-account/${accountId}?tab=movements&txn=${transactionId}`);
  };

  return (
    <button
      type="button"
      onClick={goToTransaction}
      title={ui('paymentGoToTransaction')}
      aria-label={ui('paymentGoToTransaction')}
      data-testid="payment-conciliado-go-to-transaction"
      className="transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--status-success-fg)]"
      style={BADGE_BUTTON_STYLE}
    >
      {CHECK_ICON}
      {ui('conciliado')}
      <ExternalLink
        size={13}
        strokeWidth={2.5}
        aria-hidden="true"
        data-testid="ExternalLink__670c2d" />
    </button>
  );
}
