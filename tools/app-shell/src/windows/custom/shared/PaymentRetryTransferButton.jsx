import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';

import { PAYMENT_STATUS_ERROR, pisOutcome } from './paymentStatuses';
import { notifyRecordUpdated } from './useRecordRefreshSignal';

// Matches the invoice modal's cadence and ceiling. Waiting too long costs nothing here — the poll
// is invisible and the user can walk away — while giving up early leaves the payment reading as in
// progress for a transfer the bank already resolved.
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 600000;

/**
 * "Reintentar transferencia" on the payment window, for a payment whose bank transfer the bank
 * refused after having already committed to it (ETP-4895).
 *
 * <p>That payment is flagged `ETGOERR` and deliberately left processed, so the retry reuses it
 * instead of registering a second one — which is why this posts the payment's own record id rather
 * than an invoice's. The backend injects `pisPaymentId` (the rejected attempt) into the payment's
 * single-record GET, and it is absent whenever there is nothing to retry.
 *
 * Renders nothing unless both conditions hold, so it is safe in the always-mounted topbar slot.
 */
export default function PaymentRetryTransferButton({
  data, specName, entity = 'header', apiBaseUrl, onRefresh,
}) {
  const ui = useUI();
  // `apiBaseUrl` points at this window's own spec (…/sws/neo/payment-out); the action hangs off the
  // spec root, so drop the last segment. Same derivation the payment modal uses. Without a base,
  // useApiFetch falls back to detectBaseUrl(), which under the dev server resolves to the SPA's own
  // origin — the request then 404s against :3100 instead of reaching NEO.
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);
  const [retrying, setRetrying] = useState(false);
  // The attempt to follow once the bank popup is open: { pisPaymentId, elapsedMs }.
  const [watching, setWatching] = useState(null);
  const popupRef = useRef(null);

  const paymentId = data?.id;
  const pisPaymentId = data?.pisPaymentId;
  const retryable = data?.status === PAYMENT_STATUS_ERROR && Boolean(pisPaymentId);

  const onRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const res = await apiFetch(`/${specName}/${entity}/${paymentId}/action/retryPisPayment`, {
        method: 'POST', body: JSON.stringify({ pisPaymentId }),
      });
      const json = res?.ok ? await res.json().catch(() => null) : null;
      const url = json?.response?.data?.pisPaymentUrl;
      if (!res?.ok || !url) {
        toast.error(ui('cpRetryTransferFailed'));
        return;
      }
      // Same popup the invoice modal opens, so the bank flow looks identical from either entry
      // point. The payment goes back to "in progress" server-side the moment the order is placed.
      popupRef.current = window.open(url, 'saltEdgePisWidget',
        'popup=yes,width=500,height=720,resizable=yes,scrollbars=yes');
      window.dispatchEvent(new CustomEvent('neo:processSuccess',
        { detail: { recordId: paymentId, process: { columnName: 'retryPisPayment' } } }));
      // Follow the new attempt to its resolution. Nothing else will: the invoice modal's poll
      // belongs to the modal, Salt Edge's webhook cannot reach a server that is not publicly
      // addressable, and PSD2's periodic refresh is not scheduled by default — so without this the
      // attempt sat at 'requested' and the payment read as in progress long after the bank had
      // executed it (ETP-4895).
      const nextPisPaymentId = json?.response?.data?.pisPaymentId;
      if (nextPisPaymentId) setWatching({ pisPaymentId: nextPisPaymentId, elapsedMs: 0 });
    } catch {
      toast.error(ui('cpRetryTransferFailed'));
    } finally {
      setRetrying(false);
    }
  }, [apiFetch, specName, entity, paymentId, pisPaymentId, retrying, ui]);

  // Everything the poll needs, read at tick time instead of captured in the effect's deps. `ui` and
  // `onRefresh` are new functions on every render (DetailView rebuilds the latter inline), so
  // depending on them cancelled the pending tick and restarted the 3s wait on each re-render — a
  // busy window could keep the poll from ever completing a single request.
  const pollCtx = useRef(null);
  pollCtx.current = { apiFetch, specName, entity, paymentId, onRefresh, ui };

  // One tick per change of `watching`, so each response schedules the next by advancing it.
  useEffect(() => {
    if (!watching) return undefined;
    if (watching.elapsedMs >= MAX_POLL_MS) {
      // Not an error: the transfer may still resolve. Whoever opens the payment next reconciles it.
      setWatching(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ctx = pollCtx.current;
      let status = null;
      try {
        const res = await ctx.apiFetch(
          `/${ctx.specName}/${ctx.entity}/${ctx.paymentId}/action/pisPaymentStatus`, {
            method: 'POST', body: JSON.stringify({ pisPaymentId: watching.pisPaymentId }),
          });
        const json = res?.ok ? await res.json().catch(() => null) : null;
        status = json?.response?.data?.status ?? json?.status ?? null;
      } catch { /* a transport blip is not a bank answer: fall through and try again */ }
      if (cancelled) return;
      // Only a status we recognize as resolutive stops the poll; anything else — including no
      // answer at all — keeps waiting, so a network problem is never read as a rejection.
      const outcome = status ? pisOutcome(status) : 'pending';
      if (outcome !== 'pending') {
        popupRef.current?.close();
        popupRef.current = null;
        setWatching(null);
        // The payment's own status changed server-side (PPM → PWNC, or back to ETGOERR). The
        // window's panels fetch their data separately, so they are told directly.
        notifyRecordUpdated(ctx.paymentId);
        ctx.onRefresh?.();
        if (outcome === 'failure') {
          toast.error(ctx.ui('cpRetryTransferRejected'));
        } else {
          toast.success(ctx.ui('cpRetryTransferDone'));
        }
        return;
      }
      setWatching(prev => (prev ? { ...prev, elapsedMs: prev.elapsedMs + POLL_INTERVAL_MS } : prev));
    }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [watching]);

  if (!retryable) return null;

  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      data-testid="payment-retry-transfer"
      className="transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 360, border: 'none',
        background: 'var(--status-destructive-bg)', color: 'var(--status-destructive-fg)',
        fontFamily: 'Inter', fontWeight: 600, fontSize: 14, lineHeight: '20px',
        whiteSpace: 'nowrap', cursor: retrying ? 'default' : 'pointer',
      }}
    >
      <RotateCcw size={15} strokeWidth={2.5} aria-hidden="true" />
      {ui('cpRetryTransfer')}
    </button>
  );
}
