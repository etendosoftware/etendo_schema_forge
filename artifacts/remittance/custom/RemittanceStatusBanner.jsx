import { CheckCircleIcon, InfoIcon, WarningIcon, LockIcon, ProhibitIcon, PaperPlaneRightIcon } from '@phosphor-icons/react';
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
  SB: { tone: 'info', icon: PaperPlaneRightIcon, key: 'remittanceBannerSent' },
  CT: { tone: 'success', icon: CheckCircleIcon, key: 'remittanceBannerCollected' },
  PT: { tone: 'success', icon: CheckCircleIcon, key: 'remittanceBannerPaid' },
  CP: { tone: 'warning', icon: WarningIcon, key: 'remittanceBannerPartiallyCollected' },
  PP: { tone: 'warning', icon: WarningIcon, key: 'remittanceBannerPartiallyPaid' },
  AN: { tone: 'danger', icon: ProhibitIcon, key: 'remittanceBannerVoided' },
};

// ETP-6247 — a remittance settled by GO's «Cobrada» (markCollected sets EM_Etar_Automaticprocess
// = Y; it stays N until then) was confirmed first, and «Confirmar» generated its SEPA file: the
// Cobrada/Pagada banner says so and where to download it.
const FILE_BANNER_KEYS = {
  CT: 'remittanceBannerCollectedFile',
  PT: 'remittanceBannerPaidFile',
};

function isAutomated(value) {
  return value === true || value === 'Y';
}

export function remittanceStatusBanner(status, automated = false) {
  const banner = STATUS_BANNERS[status] ?? null;
  if (banner && isAutomated(automated) && FILE_BANNER_KEYS[status]) {
    return { ...banner, key: FILE_BANNER_KEYS[status] };
  }
  return banner;
}

export default function RemittanceStatusBanner({ data }) {
  const ui = useUI();
  if (!data?.id) return null;
  const banner = remittanceStatusBanner(data.remittanceStatus, data.eTARAutomaticprocess);
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
