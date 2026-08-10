import { useUI } from '@/i18n';

/* eslint-disable react/prop-types */

const DEPOSITED = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC']);

const InfoIcon = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="9" stroke="hsl(var(--card))" strokeWidth="1.5" fill="hsl(var(--foreground))" />
    <rect x="11" y="10.5" width="2" height="5.5" rx="1" fill="hsl(var(--card))" />
    <rect x="11" y="8" width="2" height="2" rx="1" fill="hsl(var(--card))" />
  </svg>
);

export default function PaymentDraftBanner({ data }) {
  const ui = useUI();
  const isDraft = data?.status && !DEPOSITED.has(data.status);
  if (!isDraft) return null;

  return (
    <div style={{ padding: '8px 8px 0' }}>
      {/* ETP-4554 ("Migrate Artifact Theme Styles") swapped the panel's neutral gray
          background (#F5F7F9) for hsl(var(--card)) — same white as the page behind it, so the
          box became invisible — and the body text (#6C6C89) for --status-info-fg (#1D4ED8,
          blue), a neutral-vs-info mis-mapping identical to the FieldItem fix in
          PaymentOutBottomPanel.jsx. --muted (#F1F5F9) is the closest token to #F5F7F9
          (imperceptibly different) and is the correct semantic choice for a de-emphasized info
          panel; restored --muted-foreground for the text, which is an exact match for #6C6C89
          (found while verifying ETP-4797). */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 8px', background: 'hsl(var(--muted))', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4, marginRight: 8 }}>
          <InfoIcon />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {/* --foreground (#0F172A, navy-tinted) reads visibly darker/cooler than the original
              #121217 (neutral near-black) — confirmed by sampling the Figma reference vs. our
              render pixel-for-pixel. Restored the literal hex (found while verifying ETP-4797). */}
          <span style={{ font: '500 14px/24px Inter', color: '#121217', whiteSpace: 'nowrap' }}>{ui('draftBannerTitle')}</span>
          <span style={{ font: '400 14px/24px Inter', color: 'hsl(var(--muted-foreground))' }}>
            {ui('draftBannerBodyOut')}
          </span>
        </div>
      </div>
    </div>
  );
}
