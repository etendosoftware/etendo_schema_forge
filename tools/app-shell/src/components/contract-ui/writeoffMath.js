/**
 * Pure decision logic for the invoice write-off (ETP-4797).
 *
 * Kept in a plain `.js` module, separate from `WriteoffAdjustment.jsx`, so the node:test runner can
 * import it — that runner cannot load `.jsx`, and this is the part worth testing on its own.
 */

/** Below this the amounts are considered equal and nothing is offered. Matches the backend. */
export const WRITEOFF_EPSILON = 0.005;

/**
 * Decides whether the write-off is on offer and whether the account's limit blocks it.
 *
 * @param {object} args
 * @param {number} args.difference  outstanding minus what the payment funds. Only a POSITIVE
 *                                  difference can be written off — a surplus (the money side
 *                                  exceeding the invoice) is a different flow entirely.
 * @param {number|null} [args.limit] the account's write-off limit. Null, absent or 0 all mean
 *                                   "no limit configured". This deliberately diverges from Classic,
 *                                   where an unset limit blocks every write-off: the column has no
 *                                   default and is not mandatory, so that reading would disable the
 *                                   feature on every account nobody had configured. See
 *                                   {@code ReconciliationHandler.assertWithinWriteoffLimit}.
 * @param {boolean} [args.eligible] caller-side gate — a single selected invoice in the
 *                                  reconciliation modal, not editing a draft in the payment modal.
 * @returns {{visible: boolean, blocked: boolean, amount: number, limit: number|null}} `limit` is
 *   the effective cap for the blocked hint — `null` when there is none, never 0 (ETP-5558: the
 *   payment modal read a missing `limit` and showed "0,00 €").
 */
export function writeoffState({ difference, limit = null, eligible = true }) {
  const amount = Number(difference) || 0;
  const cap = Number(limit) > 0 ? Number(limit) : null;
  if (!eligible || amount < WRITEOFF_EPSILON) {
    return { visible: false, blocked: false, amount, limit: cap };
  }
  return { visible: true, blocked: cap !== null && amount > cap, amount, limit: cap };
}
