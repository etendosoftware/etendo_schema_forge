/**
 * ETP-5111 — why a movement cannot be deleted, decided in ONE place.
 *
 * The unified delete rule for this window is "never pre-block the affordance, always explain the
 * refusal": the row kebab's "Eliminar" and the bulk-delete trash button are always offered, and a
 * movement the backend would reject is answered with the reason instead of a hidden or disabled
 * control. For the kebab that reason is known client-side, so it is shown as an immediate toast
 * with no round-trip; the rules below mirror the backend's own 409 guards in
 * `FinancialAccountTransactionsHandler.handleDelete` so both paths read identically.
 *
 * A plain `.js` module (no JSX, no React) — same pattern as the sibling `statementStatus.js` and
 * `movementStatusConfig.js` — so the decision is unit-testable without a renderer and can be
 * imported by any surface (row kebab today, the bulk-delete bar's own messaging tomorrow) without
 * creating a cycle between component files.
 */

/**
 * Resolves the reason a movement cannot be deleted, in the same precedence the backend applies.
 *
 * Every branch returns one of the very `backendError.*` keys `BACKEND_ERROR_MAP` maps the backend's
 * own 409 literals to, and none of them interpolates anything — so the user reads a byte-identical
 * sentence whether it came from this client-side pre-check (the row kebab) or from the server (the
 * bulk path, REST, MCP). That is the whole reason this returns a KEY rather than a formatted
 * string.
 *
 * 1. Linked to a payment or a receipt — the bank transaction belongs to the `FIN_Payment` and must
 *    be removed from that side (the correct direction is payment → transaction; deleting the
 *    transaction alone would leave the payment without its bank movement). `paymentIsReceipt`
 *    picks the wording: `'Y'` is a receipt (cobro), anything else a payment (pago) — the same test
 *    `MovementsTable.openPayment` uses to choose between the `payment-in` and `payment-out`
 *    windows. The payment's document number is deliberately NOT named: it added a second, longer
 *    variant of the sentence for no decision the user can act on differently.
 * 2. A funds-transfer leg — its counterpart references it through a RESTRICT self-FK on
 *    FIN_FINACC_TRANSACTION, so the removal can only ever fail. A bank fee (BF) carries the same
 *    `transferTxnId` but nothing references IT, so it stays deletable.
 * 3. Otherwise deletable — a processed or posted movement is NOT blocked here: deleting it one at a
 *    time runs Payment Removal server-side, which reactivates it first.
 *
 * @param {{ paymentId?: string, paymentIsReceipt?: string, transferTxnId?: string, trxType?: string }} movement
 * @returns {{ key: string }|null} `null` when a delete may be attempted.
 */
export function resolveMovementDeleteBlock(movement) {
  if (!movement) return null;

  if (movement.paymentId) {
    return movement.paymentIsReceipt === 'Y'
      ? { key: 'backendError.receiptMovementNotDeletable' }
      : { key: 'backendError.paymentMovementNotDeletable' };
  }

  if (movement.transferTxnId && movement.trxType !== 'BF') {
    return { key: 'backendError.transferMovementNotDeletable' };
  }

  return null;
}
