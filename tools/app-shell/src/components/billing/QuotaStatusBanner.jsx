import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import { useUI } from '@/i18n';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { Button } from '@/components/ui/button';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';
import { ownsEnvironmentSubscription } from '@/lib/environmentPresentation.js';
import {
  QUOTA_VERDICT_DENY,
  isQuotaOverLimit,
  quotaAlertItems,
  quotaBannerDismissKey,
  quotaUsageWithPeriod,
} from '@/lib/planQuotas.js';

// Same exclusions as the payment banner: `/account` already lists every quota with its state, and
// `/upgrade` is a full-screen overlay the banner would sit invisibly under.
const HIDDEN_ON_PATHS = ['/account', '/upgrade'];
function isHiddenOnPath(pathname) {
  return HIDDEN_ON_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
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
 * administrator, the same split as `BillingStatusBanner`. Dismissible for the browser session; a
 * new verdict (another resource, or a WARN turning into a DENY) shows it again.
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

  if (items.length === 0 || isHiddenOnPath(pathname)) return null;
  if (dismissedKey === dismissKey || readDismissed(dismissKey)) return null;

  const denied = items.some((item) => item.verdict === QUOTA_VERDICT_DENY);
  const canManage = ownsEnvironmentSubscription(environment);
  const dismiss = () => {
    writeDismissed(dismissKey);
    setDismissedKey(dismissKey);
  };

  return (
    <InfoBanner
      tone={denied ? 'danger' : 'warning'}
      icon={Gauge}
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
          onClick={() => navigate('/account')}
          data-testid="quota-status-banner-cta"
        >
          {ui('quotaBannerCta')}
        </Button>
      ) : null}
    >
      <ul className="space-y-0.5" data-testid="quota-status-banner-items">
        {items.map((item) => (
          <li
            key={item.resourceKey || item.resourceName}
            data-testid="quota-status-banner-item"
            data-verdict={item.verdict}
          >
            {ui(alertMessageKey(item), {
              resource: item.resourceName,
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
