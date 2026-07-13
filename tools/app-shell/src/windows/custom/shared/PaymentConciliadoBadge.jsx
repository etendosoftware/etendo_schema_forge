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

export default function PaymentConciliadoBadge({ data }) {
  const ui = useUI();
  if (data?.status !== RECONCILED_STATUS) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 8px', borderRadius: 360,
      background: '#EEFBF4', color: '#17663A',
      fontFamily: 'Inter', fontWeight: 600, fontSize: 14, lineHeight: '20px',
      whiteSpace: 'nowrap',
    }}>
      {CHECK_ICON}
      {ui('conciliado')}
    </span>
  );
}
