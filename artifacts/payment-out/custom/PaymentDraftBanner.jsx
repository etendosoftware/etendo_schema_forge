import { useUI } from '@/i18n';
import { paymentDisplayState } from '@/windows/custom/shared/paymentStatuses';

/* eslint-disable react/prop-types */

const InfoIcon = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="9" stroke="hsl(var(--card))" strokeWidth="1.5" fill="hsl(var(--foreground))" />
    <rect x="11" y="10.5" width="2" height="5.5" rx="1" fill="hsl(var(--card))" />
    <rect x="11" y="8" width="2" height="2" rx="1" fill="hsl(var(--card))" />
  </svg>
);

export default function PaymentDraftBanner({ data }) {
  const ui = useUI();
  // Reasoning by elimination ("not deposited, therefore a draft") put this banner on ETGOERR
  // payments, which are processed and rejected, not drafts — telling the user the payment has "no
  // impact on cash" right under a "Payment error" pill (ETP-4895). The shared state rule is the one
  // that knows every status; the local copy of the deposited list is gone with it.
  if (!data?.status || paymentDisplayState(data) !== 'draft') return null;

  return (
    <div style={{ padding: '8px 8px 0' }}>
      {/* ETP-4554 ("Migrate Artifact Theme Styles") swapped the panel's light neutral gray
          background for hsl(var(--card)) — same white as the page behind it, so the box became
          invisible — and the body text's mid-gray for --status-info-fg (a saturated blue), a
          neutral-vs-info mis-mapping identical to the FieldItem fix in PaymentOutBottomPanel.jsx.
          --muted is imperceptibly close to the original background and is the correct semantic
          choice for a de-emphasized info panel; restored --muted-foreground for the text, which
          is an exact match for the original gray (found while verifying ETP-4797). */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 8px', background: 'hsl(var(--muted))', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4, marginRight: 8 }}>
          <InfoIcon />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {/* --foreground (navy-tinted near-black) reads visibly darker/cooler than the original
              neutral near-black — confirmed by sampling the Figma reference vs. our render
              pixel-for-pixel. Restored the literal color, allowlisted in semanticThemeUsage.test.js
              (found while verifying ETP-4797). */}
          <span style={{ font: '500 14px/24px Inter', color: '#121217', whiteSpace: 'nowrap' }}>{ui('draftBannerTitle')}</span>
          <span style={{ font: '400 14px/24px Inter', color: 'hsl(var(--muted-foreground))' }}>
            {ui('draftBannerBodyOut')}
          </span>
        </div>
      </div>
    </div>
  );
}
