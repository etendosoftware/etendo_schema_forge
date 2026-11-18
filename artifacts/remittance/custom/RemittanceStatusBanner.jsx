import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  LockIcon,
  ProhibitIcon,
} from '@phosphor-icons/react';
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
  PE: { tone: 'info', icon: InfoIcon, key: 'remittanceBannerPending' },
  PR: { tone: 'info', icon: LockIcon, key: 'remittanceBannerProcessed' },
  CT: { tone: 'success', icon: CheckCircleIcon, key: 'remittanceBannerCollected' },
  PT: { tone: 'success', icon: CheckCircleIcon, key: 'remittanceBannerPaid' },
  CP: { tone: 'warning', icon: WarningIcon, key: 'remittanceBannerPartiallyCollected' },
  PP: { tone: 'warning', icon: WarningIcon, key: 'remittanceBannerPartiallyPaid' },
  AN: { tone: 'danger', icon: ProhibitIcon, key: 'remittanceBannerVoided' },
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
