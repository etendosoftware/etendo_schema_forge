import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import { useUI } from '@/i18n';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { Button } from '@/components/ui/button';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';
import { ownsEnvironmentSubscription } from '@/lib/environmentPresentation.js';
import { useSubscriptionPagePath, useSubscriptionPath } from '@/lib/myCompanies/subscriptionPath.js';
import { MY_COMPANIES_SOURCES } from '@/lib/myCompanies/telemetry.js';
import {
  QUOTA_ALERT_PINNED,
  QUOTA_VERDICT_DENY,
  isQuotaOverLimit,
  quotaAlertBehavior,
  quotaAlertItems,
  quotaBannerDismissKey,
  quotaResourceLabel,
  quotaUsageWithPeriod,
} from '@/lib/planQuotas.js';

// Same exclusions as the payment banner: the subscription page the CTA leads to (`/account`, or
// "Mis empresas" with the `my-companies-page` flag on — ETP-6060) already lists every quota with its
// state, and `/upgrade` is a full-screen overlay the banner would sit invisibly under.
function isHiddenOnPath(pathname, subscriptionPage) {
  return [subscriptionPage, '/upgrade']
    .some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// sessionStorage can be missing or throw; a dismissal is a convenience.
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
    // The banner is dismissed for this render only.
  }
}

function alertMessageKey(item) {
  if (item.verdict === QUOTA_VERDICT_DENY) return 'quotaBannerDeny';
  return isQuotaOverLimit(item) ? 'quotaBannerOver' : 'quotaBannerWarn';
}

/**
 * ETP-5051 — reports, inside an environment, the plan quotas that are close to or at their limit.
 * Report-only: entering is never refused for a quota, but once a `block` quota is reached (DENY)
 * new records of that kind are refused on write, and this is where the user hears it first.
 *
 * The data is the current environment's `quotas` in `GET /sws/go/environments` (WARN/DENY items
 * only, contract §4b), read exactly like the payment banner reads `graceEndsAt`. The owner gets "View plan usage" (→ `/account`,
 * whose Subscription section lists every quota); anyone else is told to contact their
 * administrator, the same split as `BillingStatusBanner`.
 *
 * Dismissal: each plan quota says how its alert is shown (`warningAlert` before the limit,
 * `limitAlert` at it: pinned, dismissible or hidden — ETP-6060, `quotaAlertBehavior`). A hidden
 * item is not listed; a banner with any pinned item has no close button and ignores a stored
 * dismissal; otherwise it is dismissible for the browser session, keyed on the reported verdicts,
 * so a new verdict (another resource, or a WARN turning into a DENY) shows it again. Left empty,
 * a DENY is pinned and a WARN dismissible: a DENY refuses every new record of that kind, so by
 * default it stays on screen until the quota is no longer reached (Martin, ETP-5051 manual
 * testing). The list behind it is kept fresh by
 * `useEnvironmentListFreshness` (focus, a 5-minute interval, and a QUOTA_EXCEEDED refusal).
 */
export function QuotaStatusBanner() {
  const ui = useUI();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { environments, currentClientId } = useEnvironmentSwitch();
  const environment = environments.find((env) => env.clientId === currentClientId);
  const quotas = environment?.quotas;
  const items = useMemo(() => quotaAlertItems(quotas), [quotas]);
  const dismissKey = quotaBannerDismissKey(currentClientId, items);
  const [dismissedKey, setDismissedKey] = useState(null);
  const subscriptionPage = useSubscriptionPagePath();
  const ctaPath = useSubscriptionPath(currentClientId, MY_COMPANIES_SOURCES.QUOTA_BANNER);

  if (items.length === 0 || isHiddenOnPath(pathname, subscriptionPage)) return null;
  const denied = items.some((item) => item.verdict === QUOTA_VERDICT_DENY);
  const pinned = items.some((item) => quotaAlertBehavior(item) === QUOTA_ALERT_PINNED);
  if (!pinned && (dismissedKey === dismissKey || readDismissed(dismissKey))) return null;

  const canManage = ownsEnvironmentSubscription(environment);
  const dismiss = () => {
    writeDismissed(dismissKey);
    setDismissedKey(dismissKey);
  };

  return (
    <InfoBanner
      tone={denied ? 'danger' : 'warning'}
      icon={Gauge}
      dismissible={!pinned}
      onDismiss={dismiss}
      dismissTestId="quota-status-banner-dismiss"
      role={denied ? 'alert' : 'status'}
      className="mr-3 mt-3"
      data-testid="quota-status-banner"
      data-variant={denied ? 'destructive' : 'warning'}
      action={canManage ? (
        <Button
          type="button"
          size="sm"
          onClick={() => navigate(ctaPath)}
          data-testid="quota-status-banner-cta"
        >
          {ui('quotaBannerCta')}
        </Button>
      ) : null}
    >
      <ul className="space-y-0.5" data-testid="quota-status-banner-items">
        {items.map((item) => (
          <li
            key={item.resourceKey || quotaResourceLabel(item)}
            data-testid="quota-status-banner-item"
            data-verdict={item.verdict}
          >
            {ui(alertMessageKey(item), {
              resource: quotaResourceLabel(item, ui),
              usage: quotaUsageWithPeriod(item, ui),
            })}
          </li>
        ))}
      </ul>
      {!canManage && (
        <span className="mt-1 block" data-testid="quota-status-banner-member-hint">
          {ui('billingPaymentFailedContactAdmin')}
        </span>
      )}
    </InfoBanner>
  );
}

export default QuotaStatusBanner;
