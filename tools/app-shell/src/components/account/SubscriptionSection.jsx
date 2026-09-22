import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { getSubscription, createPortalSession, getCheckoutToken } from '@/lib/upgrade/api.js';

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
 * `getSubscription` and `createPortalSession` hang off the platform/account token
 * (`getCheckoutToken`), never the environment session `useApiFetch` would send — the same rule
 * `AccountSettingsPage.load()` and `UpgradePage.jsx` already follow for every billing call.
 *
 * `SubscriptionSection__root` is the stable inner anchor and is always present, even when the
 * caller also sets its own outer `data-testid` (AccountSettingsPage sets
 * `SubscriptionSection__account` on the whole composed section) — the outer id names the
 * section for a caller composing several of these; the inner one is this component's own,
 * caller-independent hook for its tests.
 */
export function SubscriptionSection({ apiBaseUrl, 'data-testid': dataTestId }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const [status, setStatus] = useState('loading'); // 'loading' | 'loaded' | 'unavailable'
  const [subscription, setSubscription] = useState(null);
  const [managing, setManaging] = useState(false);
  const [manageError, setManageError] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setManageError(false);
    try {
      // raw-fetch-ok: billing endpoints authenticate with the account/platform token
      // (getCheckoutToken), never the ERP session useApiFetch would send.
      const result = await getSubscription(fetch, apiBaseUrl, getCheckoutToken());
      setSubscription(result || null);
      setStatus('loaded');
    } catch {
      setSubscription(null);
      setStatus('unavailable');
    }
  }, [apiBaseUrl]);

  useEffect(() => { load(); }, [load]);

  const handleManage = useCallback(async () => {
    setManageError(false);
    setManaging(true);
    try {
      // raw-fetch-ok: see the note in load() above.
      const session = await createPortalSession(fetch, apiBaseUrl, getCheckoutToken());
      if (!session?.url) throw new Error('Portal session carried no url');
      window.location.assign(session.url);
    } catch {
      setManageError(true);
    } finally {
      setManaging(false);
    }
  }, [apiBaseUrl]);

  const hasSubscription = subscription?.hasSubscription === true;
  const isPastDue = subscription?.status === 'PAST_DUE';
  const cancelsAtPeriodEnd = subscription?.cancelAtPeriodEnd === true;
  const renewalDate = subscription?.renewalAt
    ? formatCalendarDate(subscription.renewalAt, locale)
    : null;

  return (
    <Card data-testid={dataTestId}>
      <CardContent className="pt-6" data-testid="SubscriptionSection__root">
        <h2 className="text-base font-semibold">{ui('subscriptionTitle')}</h2>

        {status === 'loading' && (
          <div
            className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="SubscriptionSection__loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
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

        {status === 'loaded' && !hasSubscription && (
          <p className="mt-4 text-sm text-muted-foreground" data-testid="SubscriptionSection__none">
            {ui('subscriptionNone')}
          </p>
        )}

        {status === 'loaded' && hasSubscription && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium" data-testid="SubscriptionSection__plan">
                {subscription.plan}
              </span>
              <span
                className="text-sm text-muted-foreground"
                data-testid="SubscriptionSection__amount"
              >
                {formatCurrency(subscription.currency, subscription.amountMinor / 100)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{ui('subscriptionStatus')}</span>
              <Badge variant="secondary" data-testid="SubscriptionSection__status">
                {subscription.status}
              </Badge>
            </div>

            {cancelsAtPeriodEnd && renewalDate && (
              <p className="text-sm text-muted-foreground" data-testid="SubscriptionSection__cancelsOn">
                {ui('subscriptionCancelsOn', { date: renewalDate })}
              </p>
            )}

            {!cancelsAtPeriodEnd && renewalDate && (
              <p className="text-sm text-muted-foreground" data-testid="SubscriptionSection__renewsOn">
                {ui('subscriptionRenewsOn', { date: renewalDate })}
              </p>
            )}

            {isPastDue && (
              <p
                className="text-sm text-destructive"
                data-testid="SubscriptionSection__graceRemaining"
              >
                {ui('subscriptionGraceRemaining', { days: subscription.graceDaysRemaining })}
              </p>
            )}

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
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
