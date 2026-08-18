// Single source of truth for the "Pendiente de pago" badge state of an invoice
// (list grid + detail topbar, AR and AP alike).
//
// ETP-4841 — the state is decided by the SIGN OF THE TOTAL, never by the document
// type. There are two functionally different kinds of Factura Rectificativa:
//
//   * negative total — billed 5, returned 2: the invoice is a credit the customer
//     can spend against other invoices ("saldo a favor").
//   * positive total — billed 3, should have been 4: a correction invoice for the
//     difference, which is PAYABLE exactly like an ordinary invoice.
//
// and symmetrically an ordinary "Factura" with a negative total IS a credit. Keying
// off `arInvoiceSubtype`/`apInvoiceSubtype === 'RECTIFICATIVA'` therefore mislabels
// both edge cases, which is precisely the bug this replaces. It also matches what
// InvoicePaymentHistoryModal (the modal these badges open) has always done:
// `const isCreditInstrument = grandTotal < 0`.

/** Amounts below this are treated as zero — guards against float dust in sums. */
const EPSILON = 0.001;

/**
 * @typedef {'draft'|'credit-available'|'credit-applied'|'paid'|'partial'|'pending'} PaymentBadgeKind
 * @typedef {{ kind: PaymentBadgeKind, amount: number, isCredit: boolean }} PaymentBadge
 *   `amount` is always non-negative and is the figure to display for that state:
 *   the remaining credit for `credit-available`, the amount still owed for
 *   `pending`/`partial`, the amount settled for `paid`, and 0 for the rest.
 *
 *   `isCredit` reports whether the document IS a credit instrument (negative total),
 *   which is a property of the document itself — it stays true for a draft, where
 *   `kind` is `'draft'` because there is no payment state to show yet.
 */

/**
 * Resolves the payment badge state of an invoice row or detail record.
 *
 * Order matters: the credit branch is evaluated BEFORE any paid/pending test,
 * because `outstandingAmount` on a negative invoice is itself negative and would
 * otherwise satisfy `outstanding <= 0` and render as "Cobrada" — the exact defect
 * this function replaces. (In dev data the two signs genuinely diverge: there are
 * positive invoices with a negative outstanding, i.e. overpaid.)
 *
 * @param {object} record row or detail record; `grandTotalAmount`,
 *   `outstandingAmount` and `documentStatus` may be numbers or numeric strings.
 * @returns {PaymentBadge}
 */
export function resolveInvoicePaymentBadge(record) {
  const grandTotal = toNumber(record?.grandTotalAmount);
  // An ABSENT outstanding means "unknown", not "nothing left to pay". Falling back to the
  // full total makes a payload without the field read as unpaid; coercing it to 0 instead
  // would render a completed invoice as settled on no evidence — the dangerous direction.
  // (This mirrors what both detail topbars did with `?? grandTotal` before ETP-4841; the
  // two grids used `?? 0` and disagreed with them.)
  const rawOutstanding = record?.outstandingAmount;
  const outstanding = rawOutstanding === null || rawOutstanding === undefined || rawOutstanding === ''
    ? grandTotal
    : toNumber(rawOutstanding);
  // A negative total is a credit instrument, whatever its document type — and that
  // stays true before the invoice is completed, so callers that only ask "is this a
  // credit?" (label swaps, due-date suppression) get the right answer on drafts too.
  const isCredit = grandTotal < 0;

  if (record?.documentStatus !== 'CO') {
    return { kind: 'draft', amount: 0, isCredit };
  }

  if (isCredit) {
    const remaining = Math.abs(outstanding);
    return remaining < EPSILON
      ? { kind: 'credit-applied', amount: 0, isCredit: true }
      : { kind: 'credit-available', amount: remaining, isCredit: true };
  }

  const paid = grandTotal - outstanding;
  if (outstanding <= 0) {
    return { kind: 'paid', amount: Math.max(paid, 0), isCredit: false };
  }
  if (paid > EPSILON) {
    return { kind: 'partial', amount: outstanding, isCredit: false };
  }
  return { kind: 'pending', amount: outstanding, isCredit: false };
}

function toNumber(value) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
}
