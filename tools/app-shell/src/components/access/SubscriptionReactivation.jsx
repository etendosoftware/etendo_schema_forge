import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { createSubscriptionReactivation, getCheckoutStatus } from '@/lib/upgrade/api.js';

/** How often, and for how long, the blocked screen waits for a paid re-subscription to apply. */
export const REACTIVATION_POLL_INTERVAL_MS = 3000;
export const REACTIVATION_POLL_ATTEMPTS = 40;

/** Where the app is reloaded once the environment is reachable again. */
const REACTIVATED_LANDING = '/dashboard';

// Module-level so the defaults keep one identity across renders: the polling effect depends on
// `reload`, and an inline default would restart it on every render.
const assignLocation = (url) => window.location.assign(url);
const replaceLocation = (path) => window.location.replace(path);

/**
 * ETP-5742 — "Reactivar suscripción" on the blocked screen of a canceled environment.
 *
 * Starts the re-subscription of the session's own environment and sends the browser to the
 * provider-hosted checkout. A re-subscription that is already paid (a second tab, or a click after
 * paying) skips the provider and waits for the payment confirmation instead (`onPaid`).
 *
 * @param {object} props
 * @param {string} props.apiBaseUrl account-level API base, as the billing pages use
 * @param {(requestId: string) => void} props.onPaid the re-subscription is paid and pending
 * @param {(url: string) => void} [props.redirect] navigation seam for tests
 */
export function ReactivateSubscriptionButton({
  apiBaseUrl,
  onPaid,
  redirect = assignLocation,
}) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(null);

  const start = useCallback(async () => {
    setBusy(true);
    setErrorKey(null);
    try {
      const result = await createSubscriptionReactivation(apiBaseUrl);
      if (result.status === 'paid') {
        onPaid(result.requestId);
        return;
      }
      redirect(result.checkoutUrl);
    } catch (error) {
      setErrorKey(error?.code === 'blockedAccessSubscriptionCanceledMemberMessage'
        ? error.code : 'blockedAccessReactivateFailed');
      setBusy(false);
    }
  }, [apiBaseUrl, onPaid, redirect]);

  return (
    <>
      <Button
        type="button"
        className="mt-4"
        disabled={busy}
        onClick={start}
        data-testid="blocked-access-reactivate"
      >
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" data-testid="Loader2__reactivate" />}
        {ui('blockedAccessReactivateCta')}
      </Button>
      {errorKey && (
        <p className="max-w-md text-sm text-destructive" role="alert"
          data-testid="blocked-access-reactivate-error">
          {ui(errorKey)}
        </p>
      )}
    </>
  );
}

/**
 * ETP-5742 — shown on the blocked screen when the browser comes back from a paid re-subscription
 * (`?reactivation=success&requestId=...`), or right after one turned out to be paid already.
 *
 * The payment webhook applies the re-subscription, usually within seconds of the redirect, so this
 * waits for the request to read `provisioned` and then reloads the app on the reactivated
 * environment. A reload is what clears the blocked state: every cache was built against the 402.
 * After {@link REACTIVATION_POLL_ATTEMPTS} it stops and offers a manual reload instead of spinning
 * forever.
 *
 * @param {object} props
 * @param {string} props.apiBaseUrl account-level API base, as the billing pages use
 * @param {string} props.requestId the re-subscription request
 * @param {(path: string) => void} [props.reload] navigation seam for tests
 * @param {number} [props.intervalMs]
 * @param {number} [props.attempts]
 */
export function ReactivationPendingNotice({
  apiBaseUrl,
  requestId,
  reload = replaceLocation,
  intervalMs = REACTIVATION_POLL_INTERVAL_MS,
  attempts = REACTIVATION_POLL_ATTEMPTS,
}) {
  const ui = useUI();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let remaining = attempts;
    const poll = async () => {
      try {
        const status = await getCheckoutStatus(apiBaseUrl, requestId);
        if (cancelled) return;
        if (status?.status === 'provisioned') {
          reload(REACTIVATED_LANDING);
          return;
        }
      } catch {
        // A failed read is retried like a pending one; only the attempt budget ends the wait.
        if (cancelled) return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        setSlow(true);
        return;
      }
      timer = setTimeout(poll, intervalMs);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [apiBaseUrl, requestId, reload, intervalMs, attempts]);

  return (
    <div className="flex flex-col items-center gap-2" data-testid="blocked-access-reactivating">
      <p className="text-base font-medium text-foreground" data-testid="blocked-access-title">
        {ui('blockedAccessReactivatingTitle')}
      </p>
      <p className="max-w-md text-sm text-muted-foreground" data-testid="blocked-access-message">
        {ui(slow ? 'blockedAccessReactivationSlowMessage' : 'blockedAccessReactivatingMessage')}
      </p>
      {slow ? (
        <Button
          type="button"
          className="mt-4"
          onClick={() => reload(REACTIVATED_LANDING)}
          data-testid="blocked-access-reactivating-reload"
        >
          <RefreshCw className="h-4 w-4 mr-2" data-testid="RefreshCw__reactivating" />
          {ui('retry')}
        </Button>
      ) : (
        <Loader2 className="mt-4 h-6 w-6 animate-spin text-muted-foreground"
          data-testid="blocked-access-reactivating-spinner" />
      )}
    </div>
  );
}
