import { useCallback, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';

import { PAYMENT_STATUS_ERROR } from './paymentStatuses';

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
export default function PaymentRetryTransferButton({ data, specName, entity = 'header', apiBaseUrl }) {
  const ui = useUI();
  // `apiBaseUrl` points at this window's own spec (…/sws/neo/payment-out); the action hangs off the
  // spec root, so drop the last segment. Same derivation the payment modal uses. Without a base,
  // useApiFetch falls back to detectBaseUrl(), which under the dev server resolves to the SPA's own
  // origin — the request then 404s against :3100 instead of reaching NEO.
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);
  const [retrying, setRetrying] = useState(false);

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
      window.open(url, 'saltEdgePisWidget',
        'popup=yes,width=500,height=720,resizable=yes,scrollbars=yes');
      window.dispatchEvent(new CustomEvent('neo:processSuccess',
        { detail: { recordId: paymentId, process: { columnName: 'retryPisPayment' } } }));
    } catch {
      toast.error(ui('cpRetryTransferFailed'));
    } finally {
      setRetrying(false);
    }
  }, [apiFetch, specName, entity, paymentId, pisPaymentId, retrying, ui]);

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
