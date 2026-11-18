import { CheckCircle2, Info, AlertTriangle, Lock, Ban, Send } from 'lucide-react';
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
  SB: { tone: 'info', icon: Send, key: 'remittanceBannerSent' },
  CT: { tone: 'success', icon: CheckCircle2, key: 'remittanceBannerCollected' },
  PT: { tone: 'success', icon: CheckCircle2, key: 'remittanceBannerPaid' },
  CP: { tone: 'warning', icon: AlertTriangle, key: 'remittanceBannerPartiallyCollected' },
  PP: { tone: 'warning', icon: AlertTriangle, key: 'remittanceBannerPartiallyPaid' },
  AN: { tone: 'danger', icon: Ban, key: 'remittanceBannerVoided' },
};

// ETP-6247 — an automated remittance (EM_Etar_Automaticprocess = Y) reaches Cobrada/Pagada on
// «Confirmar», which also generates the SEPA file: its banner says so and where to download it.
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
