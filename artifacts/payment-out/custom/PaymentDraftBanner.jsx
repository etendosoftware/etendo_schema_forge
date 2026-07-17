import { useUI } from '@/i18n';

/* eslint-disable react/prop-types */

const DEPOSITED = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC']);

const InfoIcon = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="9" stroke="#D1D4DB" strokeWidth="1.5" fill="#121217" />
    <rect x="11" y="10.5" width="2" height="5.5" rx="1" fill="white" />
    <rect x="11" y="8" width="2" height="2" rx="1" fill="white" />
  </svg>
);

export default function PaymentDraftBanner({ data }) {
  const ui = useUI();
  const isDraft = data?.status && !DEPOSITED.has(data.status);
  if (!isDraft) return null;

  return (
    <div style={{ padding: '8px 8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 8px', background: '#F5F7F9', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4, marginRight: 8 }}>
          <InfoIcon />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          <span style={{ font: '500 14px/24px Inter', color: '#121217', whiteSpace: 'nowrap' }}>{ui('draftBannerTitle')}</span>
          <span style={{ font: '400 14px/24px Inter', color: '#6C6C89' }}>
            {ui('draftBannerBodyOut')}
          </span>
        </div>
      </div>
    </div>
  );
}
