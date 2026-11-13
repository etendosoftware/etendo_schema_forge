import { CheckCircle2, Info, AlertTriangle, Lock, Ban } from 'lucide-react';
import { InfoBanner } from '@/components/InfoBanner';
import { useUI } from '@/i18n';

/**
 * ETP-6148 — what the remittance's status means for the user, under the top bar
 * (`window.customComponents.subHeader`, the record-wide notice slot). One translated sentence per
 * REM status code (`remittanceStatus`, list REM_RemittanceStatus); a code without an entry, or a
 * new record that has no status yet, renders nothing. Not dismissible: it explains the state the
 * record is in, it is not a one-off advice.
 */
const STATUS_BANNERS = {
  PE: { tone: 'info', icon: Info, key: 'remittanceBannerPending' },
  PR: { tone: 'info', icon: Lock, key: 'remittanceBannerProcessed' },
  CT: { tone: 'success', icon: CheckCircle2, key: 'remittanceBannerCollected' },
  PT: { tone: 'success', icon: CheckCircle2, key: 'remittanceBannerPaid' },
  CP: { tone: 'warning', icon: AlertTriangle, key: 'remittanceBannerPartiallyCollected' },
  PP: { tone: 'warning', icon: AlertTriangle, key: 'remittanceBannerPartiallyPaid' },
  AN: { tone: 'danger', icon: Ban, key: 'remittanceBannerVoided' },
};

export function remittanceStatusBanner(status) {
  return STATUS_BANNERS[status] ?? null;
}

export default function RemittanceStatusBanner({ data }) {
  const ui = useUI();
  if (!data?.id) return null;
  const banner = remittanceStatusBanner(data.remittanceStatus);
  if (!banner) return null;
  return (
    <InfoBanner
      tone={banner.tone}
      icon={banner.icon}
      dismissible={false}
      className="mb-4"
      data-status={data.remittanceStatus}
      data-testid="remittance-status-banner"
    >
      {ui(banner.key)}
    </InfoBanner>
  );
}
