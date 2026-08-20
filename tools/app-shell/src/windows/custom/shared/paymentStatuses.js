/**
 * Statuses Core sets on a payment that has been confirmed. PWNC ("Withdrawn not Cleared") and
 * RPAE ("Awaiting Execution") are the confirmed states for payments-out / deferred accounts —
 * without them a confirmed purchase payment was mislabeled as a draft.
 */
export const DEPOSITED_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC', 'RPAE']);

export const DEPOSITED_STATUSES_LIST = ['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC', 'RPAE'];

/**
 * "Payment Made" — Core sets it on a payment that is confirmed but has NOT been withdrawn from its
 * financial account, so no {@code FIN_Finacc_Transaction} exists for it yet. Once the withdrawal is
 * recorded Core moves the payment on to PWNC.
 *
 * This is the state a Salt Edge transfer sits in between `authorized` (the bank committed to it)
 * and `executed` (the money actually moved): the accounts Etendo Go pays from over PIS are
 * configured without automatic withdrawal precisely so the transaction only appears once Salt Edge
 * reports execution.
 *
 * So calling PPM "deposited" is wrong in every case, not only the PIS one — the money has not left
 * the account yet (ETP-4895).
 */
export const STATUS_PAYMENT_MADE = 'PPM';

/**
 * FIN_Payment status added by com.etendoerp.go for a bank transfer the bank rejected *after* it
 * had already committed to it — the only rejection that leaves a payment behind, since a payment
 * is not created until `authorized`. A rejection before that point creates nothing at all and is
 * reported in the payment modal instead.
 *
 * The payment stays **processed**: it is deliberately not reactivated, so it keeps holding the
 * invoice's installment and any credit it consumed, which is what lets the retry reuse it instead
 * of registering a second payment. The trade-off is that the invoice still reads as paid until the
 * retry succeeds — this row is the only signal that it is not (ETP-4895).
 */
export const PAYMENT_STATUS_ERROR = 'ETGOERR';

/** True when the payment is confirmed rather than an editable draft. */
export function isPaymentProcessed(payment) {
  return payment?.processed === true || DEPOSITED_STATUSES.has(payment?.status || '');
}

/**
 * The single place that decides how a payment reads to the user.
 *
 * Every surface that shows a payment goes through here — the invoice's payment modal, the invoice
 * preview card, the payments grid and the payment window — because each of them used to carry its
 * own copy of the status list. That is exactly how one PIS transfer ended up reading "Pago en
 * progreso" in the modal and "Pago depositado" in the payment window at the same time (ETP-4895).
 *
 * @param payment a payment row; `pisPending` is optional (see below)
 * @returns one of `'error' | 'inProgress' | 'deposited' | 'draft'`
 */
export function paymentDisplayState(payment) {
  const status = payment?.status || '';
  if (status === PAYMENT_STATUS_ERROR) return 'error';
  // `pisPending` is the backend's exact answer — processed, initiated over PIS, and with no bank
  // transaction. Only the invoice payment-list action carries it; where it is absent, PPM answers
  // the same question from the status alone (see STATUS_PAYMENT_MADE).
  if (payment?.pisPending === true) return 'inProgress';
  if (status === STATUS_PAYMENT_MADE) return 'inProgress';
  if (isPaymentProcessed(payment)) return 'deposited';
  return 'draft';
}
