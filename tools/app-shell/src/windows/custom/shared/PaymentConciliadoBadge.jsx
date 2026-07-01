import { useUI } from '@/i18n';

/* eslint-disable react/prop-types */

const CHECK_ICON = (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function PaymentConciliadoBadge({ data }) {
  const ui = useUI();
  if (data?.status !== 'RPPC') return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px 2px 8px', borderRadius: 360,
      background: '#ECFDF3', color: '#17663A',
      fontFamily: 'Inter', fontWeight: 500, fontSize: 12, lineHeight: '20px',
      whiteSpace: 'nowrap',
    }}>
      {CHECK_ICON}
      {ui('conciliado')}
    </span>
  );
}
