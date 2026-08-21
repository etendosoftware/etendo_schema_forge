import { useCallback, useEffect, useMemo, useState } from 'react';

import { useApiFetch } from '@/auth/useApiFetch.js';

import ConfirmPaymentModal from './ConfirmPaymentModal';
import NewPaymentEntryModal from './NewPaymentEntryModal.jsx';
import { notifyRecordUpdated } from './useRecordRefreshSignal';

/** Which invoice window a payment's editor belongs to. PIS aside, direction decides it. */
const INVOICE_SPEC = { in: 'sales-invoice', out: 'purchase-invoice' };

/**
 * Opens the invoice's own payment editor for a DRAFT payment, from the payment window and from the
 * payments grid.
 *
 * <p>Both used to offer a yes/no "Confirmar pago" dialog, which was the only thing they could
 * offer: the payment window has no form of its own (`hideFormCard`, every header field
 * `form: false`), so a user who reactivated a payment to fix its amount could only re-confirm it
 * unchanged. The invoice already has the editable modal — this reuses it rather than building a
 * second one.
 *
 * <p>Everything the editor needs comes from endpoints that already exist:
 *
 *   1. `invoiceId` — injected on the payment record by `ReactivatePaymentHandler`.
 *   2. the invoice header — for the currency, document number and outstanding.
 *   3. `invoicePayments` — the ONE source of a payment in the exact shape the editor consumes,
 *      including `creditSourcesUsed`, which no other endpoint returns.
 *
 * <p>Falls back to the confirm dialog whenever the invoice cannot be resolved: a payment applied to
 * no invoice (an abandoned shell), to more than one, or a lookup that failed. Never leaves the user
 * without a way to confirm.
 */
export default function PaymentEditModalLauncher({
  dir, record, apiBaseUrl, onConfirm, onClose, onRefresh,
}) {
  const specName = INVOICE_SPEC[dir] || INVOICE_SPEC.out;
  // apiBaseUrl points at this window's own spec (…/sws/neo/payment-out); everything here hangs off
  // the spec root, so drop the last segment — same derivation the payment modal itself uses.
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);

  const invoiceId = record?.invoiceId;
  const paymentId = record?.id;
  const [resolved, setResolved] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!invoiceId || !paymentId) {
      setFailed(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        // Each request swallows its own rejection: with a bare Promise.all, one failure leaves the
        // other promise rejecting into nothing, which the browser reports as an unhandled rejection
        // even though we recover fine. A null response falls through to the same guard below.
        const settle = (request) => request.then((res) => res).catch(() => null);
        const [invoiceRes, paymentsRes] = await Promise.all([
          settle(apiFetch(`/${specName}/header/${invoiceId}`)),
          settle(apiFetch(`/${specName}/header/${invoiceId}/action/invoicePayments`,
            { method: 'POST', body: '{}' })),
        ]);
        const invoiceJson = invoiceRes?.ok ? await invoiceRes.json().catch(() => null) : null;
        const paymentsJson = paymentsRes?.ok ? await paymentsRes.json().catch(() => null) : null;
        const invoice = invoiceJson?.response?.data?.[0];
        const rows = paymentsJson?.response?.data || [];
        const payment = rows.find((p) => p.id === paymentId);
        if (cancelled) return;
        if (!invoice || !payment) {
          setFailed(true);
          return;
        }
        setResolved({ invoice, payment });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [apiFetch, specName, invoiceId, paymentId]);

  const onSaved = useCallback(() => {
    // onRefresh reloads the record itself; the panels that show its applied lines and totals fetch
    // those separately and have nothing in the payload to react to, so they are told directly.
    notifyRecordUpdated(paymentId);
    onClose?.();
    onRefresh?.();
  }, [paymentId, onClose, onRefresh]);

  // Anything we could not resolve keeps the dialog it had before, so confirming is never blocked.
  if (failed) {
    return (
      <ConfirmPaymentModal
        dir={dir}
        onConfirm={onConfirm}
        onClose={onClose}
        data-testid="ConfirmPaymentModal__b085c9" />
    );
  }
  // Resolving is two requests against a record the user just clicked; rendering nothing for that
  // moment reads as a slow button, whereas a spinner over the whole window reads as a hang.
  if (!resolved) return null;

  return (
    <NewPaymentEntryModal
      dir={dir}
      specName={specName}
      invoiceId={invoiceId}
      invoiceData={resolved.invoice}
      outstanding={resolved.invoice.outstandingAmount}
      payment={resolved.payment}
      apiBaseUrl={`${base}/${specName}`}
      onClose={onClose}
      onSaved={onSaved}
      data-testid="PaymentEditModalLauncher__modal" />
  );
}
