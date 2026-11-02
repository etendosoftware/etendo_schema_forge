import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { Button } from '@/components/ui/button';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import {
  paymentGraceWarning,
  paymentGraceWarningDismissKey,
} from '@/lib/environmentPresentation.js';
import { useSubscriptionPagePath, useSubscriptionPath } from '@/lib/myCompanies/subscriptionPath.js';
import { MY_COMPANIES_SOURCES } from '@/lib/myCompanies/telemetry.js';

const BANNER_DATE = { day: 'numeric', month: 'long', year: 'numeric' };

// The subscription page is where "Update payment" leads (`/account`, or "Mis empresas" with the
// `my-companies-page` flag on — ETP-6060): its Subscription section already shows the grace
// countdown next to the portal button, so the banner would only repeat it and link to itself.
// `/upgrade` is a full-screen overlay (`fixed inset-0 z-50`) drawn over the layout: the banner
// would be invisible under it yet still in the accessibility tree, an unseen `role="alert"`.
function isHiddenOnPath(pathname, subscriptionPage) {
  return [subscriptionPage, '/upgrade']
    .some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// sessionStorage can be missing or throw (private window, blocked site data). A dismissal is a
// convenience, so failing to read or write it only means the banner shows again.
function readDismissed(key) {
  try {
    return globalThis.sessionStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key) {
  try {
    globalThis.sessionStorage?.setItem(key, '1');
  } catch {
    // Nothing to do: the banner is simply dismissed for this render only.
  }
}

/**
 * ETP-5049 — warns inside the environment that its last renewal payment failed, while the
 * subscription is PAST_DUE and still inside its grace period. Without it the first in-app signal
 * was the blocked screen, although most failed payments are fixable within grace.
 *
 * The decision is the pure `paymentGraceWarning` (environmentPresentation.js); this component only
 * renders it. The owner gets "Update payment" (→ `/account`, where the Subscription section opens
 * the payment portal); anyone else is told to contact their administrator, with no CTA. In the
 * last days before the block it turns destructive and cannot be dismissed; before that it can be
 * dismissed for the browser session, per client and grace window.
 *
 * When the environment's `accessEnforced` is false (the kill switch, `open-and-notable-topics.md`
 * §4.17) the warning is `neutral`: "payment overdue" with no block date, never escalated.
 */
export function BillingStatusBanner() {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { environments, currentClientId } = useEnvironmentSwitch();
  const environment = environments.find((env) => env.clientId === currentClientId);
  const warning = paymentGraceWarning(environment);
  const dismissKey = paymentGraceWarningDismissKey(currentClientId, environment?.graceEndsAt);
  const [dismissedKey, setDismissedKey] = useState(null);
  const subscriptionPage = useSubscriptionPagePath();
  const ctaPath = useSubscriptionPath(currentClientId, MY_COMPANIES_SOURCES.BILLING_BANNER);

  if (!warning || isHiddenOnPath(pathname, subscriptionPage)) return null;
  const dismissible = !warning.escalated;
  if (dismissible && (dismissedKey === dismissKey || readDismissed(dismissKey))) return null;

  // ETP-5051 / §4.17 — with enforcement switched off for this tenant there is no block date to
  // announce: the neutral sentence says only that the payment is overdue.
  const message = warning.neutral
    ? ui('billingPaymentOverdueBanner')
    : ui('billingPaymentFailedBanner', {
      date: formatCalendarDate(warning.graceEndsAt, locale, BANNER_DATE),
    });
  const dismiss = () => {
    writeDismissed(dismissKey);
    setDismissedKey(dismissKey);
  };

  return (
    <InfoBanner
      tone={warning.escalated ? 'danger' : 'warning'}
      icon={AlertTriangle}
      dismissible={dismissible}
      onDismiss={dismiss}
      dismissTestId="billing-status-banner-dismiss"
      role={warning.escalated ? 'alert' : 'status'}
      className="mr-3 mt-3"
      data-testid="billing-status-banner"
      data-variant={warning.escalated ? 'destructive' : 'warning'}
      action={warning.canPay ? (
        <Button
          type="button"
          size="sm"
          onClick={() => navigate(ctaPath)}
          data-testid="billing-status-banner-cta"
        >
          {ui('billingUpdatePaymentCta')}
        </Button>
      ) : null}
    >
      <span data-testid="billing-status-banner-message">
        {message}
      </span>
      {!warning.canPay && (
        <span className="ml-1" data-testid="billing-status-banner-member-hint">
          {ui('billingPaymentFailedContactAdmin')}
        </span>
      )}
    </InfoBanner>
  );
}

export default BillingStatusBanner;
