import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { getSubscription, createPortalSession } from '@/lib/upgrade/api.js';
import { minorUnitsToAmount } from '@/lib/upgrade/currency.js';
import { RENEWING_STATUSES } from '@/lib/upgrade/subscriptionStatus.js';
import {
  QUOTA_VERDICT_DENY,
  quotaResourceLabel,
  quotaStateKey,
  quotaUsageWithPeriod,
} from '@/lib/planQuotas.js';

const QUOTA_PERIOD_DATE = { day: 'numeric', month: 'short', year: 'numeric' };
const QUOTA_WARNING_BADGE = 'border-status-warning-border bg-status-warning text-status-warning-foreground';

/**
 * ETP-5051 — the plan's quotas, read-only: what the plan includes and how much of it the current
 * billing period has used. The data is `planQuotas` of `GET /sws/go/billing/subscription`, the full
 * `QuotaItem` (see `lib/planQuotas.js`). Rules the copy follows:
 *
 * - a plan with an empty `planQuotas` has no limits — unlimited (`open-and-notable-topics.md` §5.1);
 * - `consumed: null` is "not measured yet", never zero;
 * - the period word is always shown, so a quota on a yearly plan reads yearly (§5.8);
 * - WARN / DENY get a state badge; ALLOW and not-evaluated (`verdict: null`, mode `off`) get none.
 *
 * `periodStart` / `periodEnd` are the subscription's current period, the same on every item, so
 * the range is shown once. They are day-level boundaries, formatted through `formatCalendarDate`.
 */
function PlanQuotas({ planName, quotas, ui, locale }) {
  if (!planName) return null;
  const items = Array.isArray(quotas) ? quotas.filter(Boolean) : [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="SubscriptionSection__quotasUnlimited">
        {ui('subscriptionPlanUnlimited')}
      </p>
    );
  }
  const withPeriod = items.find((item) => item.periodStart && item.periodEnd);
  return (
    <div className="space-y-2" data-testid="SubscriptionSection__quotas">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{ui('subscriptionPlanLimits')}</h3>
        {withPeriod && (
          <span
            className="text-xs text-muted-foreground"
            data-testid="SubscriptionSection__quotaPeriod"
          >
            {ui('quotaCurrentPeriod', {
              start: formatCalendarDate(withPeriod.periodStart, locale, QUOTA_PERIOD_DATE),
              end: formatCalendarDate(withPeriod.periodEnd, locale, QUOTA_PERIOD_DATE),
            })}
          </span>
        )}
      </div>
      <ul className="divide-y rounded-md border">
        {items.map((item, index) => {
          const stateKey = quotaStateKey(item);
          const notMeasured = item.consumed === null || item.consumed === undefined;
          return (
            <li
              key={item.resourceKey || `${item.resourceName}-${index}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              data-testid="SubscriptionSection__quota"
              data-verdict={item.verdict || ''}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium" data-testid="SubscriptionSection__quotaName">
                  {quotaResourceLabel(item)}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="SubscriptionSection__quotaUsage">
                  {quotaUsageWithPeriod(item, ui)}
                  {notMeasured && (
                    <span className="ml-1" data-testid="SubscriptionSection__quotaNotMeasured">
                      {ui('quotaNotMeasured')}
                    </span>
                  )}
                </p>
              </div>
              {stateKey && (
                <Badge
                  variant={item.verdict === QUOTA_VERDICT_DENY ? 'destructive' : 'outline'}
                  className={item.verdict === QUOTA_VERDICT_DENY ? undefined : QUOTA_WARNING_BADGE}
                  data-testid="SubscriptionSection__quotaState"
                >
                  {ui(stateKey)}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Maps Stripe's live subscription `status` (lowercase, provider-defined — see
 * `StripeCustomerPortalService.SubscriptionDetail.fromProviderJson`, which reads it verbatim
 * from `subscription.status` in the provider's API response) to a translated label key.
 * `active` and `past_due` intentionally reuse the existing `subscriptionCurrent` /
 * `subscriptionPastDue` keys (already shipped for the stored `EnvironmentAccessPolicy`
 * projection) because the words apply just as well to the live provider value. There is no
 * mapping to `subscriptionExpired` here: that key names the STORED policy state reached only
 * after the grace period elapses, which is a different signal than any single live Stripe
 * status (see the `graceEndsAt` note below) and reusing it here would say something the
 * provider isn't saying.
 */
const STRIPE_STATUS_LABEL_KEYS = {
  active: 'subscriptionCurrent',
  trialing: 'subscriptionTrialing',
  past_due: 'subscriptionPastDue',
  canceled: 'subscriptionCanceled',
  unpaid: 'subscriptionUnpaid',
  incomplete: 'subscriptionIncomplete',
  incomplete_expired: 'subscriptionIncompleteExpired',
  paused: 'subscriptionPaused',
};

/**
 * The account owner's Subscription section on `/account` (ETP-5443).
 *
 * Only `status` and the grace due date are durable — they feed `EnvironmentAccessPolicy` at ERP
 * login, which cannot depend on an external call. Everything else shown here (plan, amount,
 * renewal date, cancellation-at-period-end) is read live from Stripe on every load, so this
 * section never drifts from the provider and never decides access itself; see
 * `docs/plans/2026-09-22-etp-5443-subscription-lifecycle-design.md` §3.3.
 *
 * Reachable while the ERP is paywalled by construction, not by a special case here: both
 * `getSubscription` and `createPortalSession` are account-level billing calls routed through the
 * shared `apiFetch` exactly like every other call in `lib/upgrade/api.js` (ETP-4576) — the
 * credential comes from the active session scheme (the `__Host-go_session` cookie, or the legacy
 * bearer), never from a token this component reads, and the portal POST carries the `X-Go-CSRF`
 * write proof `apiFetch` adds on unsafe methods.
 *
 * ETP-5455 — billing accepts only a platform credential, so a legacy bearer session is refused here
 * with a 401 while /me still answers. That is not an outage and Retry cannot fix it, so it is not
 * drawn as `unavailable`: the section hands it to `onSessionExpired`, and the host (AccountSettings)
 * replaces the page with its session-expired state. With no host listening it says so itself.
 *
 * `SubscriptionSection__root` is the stable inner anchor and is always present, even when the
 * caller also sets its own outer `data-testid` (AccountSettingsPage sets
 * `SubscriptionSection__account` on the whole composed section) — the outer id names the
 * section for a caller composing several of these; the inner one is this component's own,
 * caller-independent hook for its tests.
 */
export function SubscriptionSection({ apiBaseUrl, onSessionExpired, 'data-testid': dataTestId }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  // 'loading' | 'loaded' | 'unavailable' | 'sessionExpired'
  const [status, setStatus] = useState('loading');
  const [subscription, setSubscription] = useState(null);
  const [managing, setManaging] = useState(false);
  const [manageError, setManageError] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setManageError(false);
    try {
      const result = await getSubscription(apiBaseUrl);
      setSubscription(result || null);
      setStatus('loaded');
    } catch (err) {
      setSubscription(null);
      if (err?.status === 401) {
        setStatus('sessionExpired');
        onSessionExpired?.();
        return;
      }
      setStatus('unavailable');
    }
  }, [apiBaseUrl, onSessionExpired]);

  useEffect(() => { load(); }, [load]);

  const handleManage = useCallback(async () => {
    setManageError(false);
    setManaging(true);
    try {
      const session = await createPortalSession(apiBaseUrl);
      if (!session?.url) throw new Error('Portal session carried no url');
      window.location.assign(session.url);
    } catch (err) {
      if (err?.status === 401) {
        setStatus('sessionExpired');
        onSessionExpired?.();
        return;
      }
      setManageError(true);
    } finally {
      setManaging(false);
    }
  }, [apiBaseUrl, onSessionExpired]);

  const hasSubscription = subscription?.hasSubscription === true;
  const normalizedAmount = subscription
    ? minorUnitsToAmount(subscription.currency, subscription.amountMinor)
    : null;
  const subscriptionAmount = normalizedAmount
    ? formatCurrency(subscription.currency, normalizedAmount.amount, {
      minimumFractionDigits: normalizedAmount.fractionDigits,
      maximumFractionDigits: normalizedAmount.fractionDigits,
    })
    : '—';
  const cancelsAtPeriodEnd = subscription?.cancelAtPeriodEnd === true;
  const renewalDate = subscription?.renewalAt
    ? formatCalendarDate(subscription.renewalAt, locale)
    : null;
  const statusLabelKey = STRIPE_STATUS_LABEL_KEYS[subscription?.status];
  const statusLabel = statusLabelKey ? ui(statusLabelKey) : subscription?.status;

  // ETP-5443 REVIEW W5: "renews on X" is a promise the subscription will still be charged on
  // that date, which is only true for a status that is actually renewing. Showing it for e.g.
  // `past_due` (which still carries a `renewalAt` — Stripe's next invoice-retry date, not a
  // renewal) or `canceled` reads as reassurance the account does not have.
  const showsRenewsOn = !cancelsAtPeriodEnd && renewalDate != null
    && RENEWING_STATUSES.has(subscription?.status);

  // `graceEndsAt` is only ever non-null when the STORED projection is PAST_DUE with a due date
  // (see `buildBillingSubscriptionJson` in `EtendoGoJwtServlet.java`); `graceDaysRemaining` is
  // computed from it there as `max(0, ceil((graceEndsAt - now) / 1 day))`. So the pair can be in
  // three states, not two: no grace window (`graceEndsAt` null); still inside it (`days > 0`,
  // the case the banner was written for); and the window has ELAPSED while the stored projection
  // has not yet been flipped to EXPIRED by the async lifecycle job (`graceEndsAt` non-null,
  // `days === 0`) — access is already paused in that gap, and saying "N days left" would be a lie
  // by omission (ETP-5443 REVIEW W4). The live Stripe `status` is a display-only value and must
  // drive neither: Stripe's own status vocabulary (active/past_due/trialing/canceled/...) can
  // disagree in timing with the stored grace window.
  const graceDaysRemaining = subscription?.graceDaysRemaining ?? 0;
  const inGraceWindow = graceDaysRemaining > 0 || subscription?.graceEndsAt != null;
  // ETP-5051 (contract §4c, `open-and-notable-topics.md` §4.17) — `accessEnforced: false` means the
  // environment-access kill switch is on for this tenant: access will not be paused, so neither the
  // countdown nor "access is paused" is true. One neutral line says only that the payment is
  // overdue. A missing field (older backend) keeps today's copy.
  const enforcementOff = subscription?.accessEnforced === false;
  const showsPaymentOverdue = enforcementOff && inGraceWindow;
  const showsGraceRemaining = !enforcementOff && graceDaysRemaining > 0;
  const showsAccessPaused = !enforcementOff && !showsGraceRemaining && subscription?.graceEndsAt != null;
  // Only English/Spanish need a singular form today (no language here inflects further at N=2+),
  // matching the manual `_one`/`_many` key-selection convention already used for this kind of
  // count-driven copy — see `fm.m349.vies.result.processed_one`/`_many` in FmModel349Page.jsx.
  const graceRemainingKey = graceDaysRemaining === 1
    ? 'subscriptionGraceRemainingOne' : 'subscriptionGraceRemaining';

  return (
    <Card data-testid={dataTestId}>
      <CardContent className="pt-6" data-testid="SubscriptionSection__root">
        <h2 className="text-base font-semibold">{ui('subscriptionTitle')}</h2>

        {status === 'loading' && (
          <div
            className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="SubscriptionSection__loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__769a8e" />
            {ui('loading')}
          </div>
        )}

        {status === 'unavailable' && (
          <div className="mt-4 space-y-3" data-testid="SubscriptionSection__unavailable">
            <p className="text-sm text-muted-foreground">{ui('subscriptionUnavailable')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={load}
              data-testid="SubscriptionSection__retry"
            >
              {ui('retry')}
            </Button>
          </div>
        )}

        {status === 'sessionExpired' && (
          <p
            className="mt-4 text-sm text-muted-foreground"
            data-testid="SubscriptionSection__sessionExpired"
          >
            {ui('accountSessionExpired')}
          </p>
        )}

        {status === 'loaded' && !hasSubscription && (
          <p className="mt-4 text-sm text-muted-foreground" data-testid="SubscriptionSection__none">
            {ui('subscriptionNoActive')}
          </p>
        )}

        {status === 'loaded' && hasSubscription && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CreditCard
                className="h-4 w-4 text-muted-foreground"
                data-testid="CreditCard__769a8e" />
              <span className="text-xs text-muted-foreground">{ui('subscriptionPlan')}</span>
              {/* ETP-5051 — the catalog plan name when the subscription has a plan row; the live
                  provider product name (`plan`) otherwise. */}
              <span className="text-sm font-medium" data-testid="SubscriptionSection__plan">
                {subscription.planName || subscription.plan}
              </span>
              <span
                className="text-sm text-muted-foreground"
                data-testid="SubscriptionSection__amount"
              >
                {subscriptionAmount}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{ui('subscriptionStatus')}</span>
              <Badge variant="secondary" data-testid="SubscriptionSection__status">
                {statusLabel}
              </Badge>
            </div>

            {cancelsAtPeriodEnd && renewalDate && (
              <p className="text-sm text-muted-foreground" data-testid="SubscriptionSection__cancelsOn">
                {ui('subscriptionCancelsOn', { date: renewalDate })}
              </p>
            )}

            {showsRenewsOn && (
              <p className="text-sm text-muted-foreground" data-testid="SubscriptionSection__renewsOn">
                {ui('subscriptionRenewsOn', { date: renewalDate })}
              </p>
            )}

            {showsGraceRemaining && (
              <p
                className="text-sm text-destructive"
                data-testid="SubscriptionSection__graceRemaining"
              >
                {ui(graceRemainingKey, { days: graceDaysRemaining })}
              </p>
            )}

            {showsPaymentOverdue && (
              <p
                className="text-sm text-destructive"
                data-testid="SubscriptionSection__paymentOverdue"
              >
                {ui('subscriptionPaymentOverdue')}
              </p>
            )}

            {showsAccessPaused && (
              <p
                className="text-sm text-destructive"
                data-testid="SubscriptionSection__accessPaused"
              >
                {ui('subscriptionAccessPaused')}
              </p>
            )}

            <PlanQuotas
              planName={subscription.planName}
              quotas={subscription.planQuotas}
              ui={ui}
              locale={locale} />

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={managing}
                onClick={handleManage}
                data-testid="SubscriptionSection__manage"
              >
                {managing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__769a8e" />
                  : ui('subscriptionManage')}
              </Button>
              {manageError && (
                <p
                  className="mt-2 text-sm text-destructive"
                  data-testid="SubscriptionSection__manageError"
                >
                  {ui('subscriptionManageError')}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SubscriptionSection;
