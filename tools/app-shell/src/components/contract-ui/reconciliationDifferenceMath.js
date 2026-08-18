/**
 * Pure decision logic for posting a partially reconciled statement line's remainder to an
 * accounting concept (GL item).
 *
 * Kept in a plain `.js` module, separate from the banner/modal `.jsx`, so the node:test runner can
 * import it — that runner cannot load `.jsx`, and this is the part worth testing on its own. Same
 * arrangement as `writeoffMath.js` and `CashClose/cashCloseMath.js`.
 *
 * Every threshold here mirrors the backend (`ReconciliationDifferenceSupport`), which re-validates
 * all of it: the UI gate is a convenience, never the boundary.
 */

/** Below half a cent there is nothing worth posting. Matches the backend's NEGLIGIBLE. */
export const DIFFERENCE_EPSILON = 0.005;

/**
 * The cap on the remainder: a percentage of the ORIGINAL statement line amount, never of the
 * remainder itself.
 *
 * The denominator matters. A partially reconciled line is stored as several rows, and the remainder
 * is its own row — so taking the percentage of the remainder would compare a number against itself
 * (always false below 100 %, and, worse, always TRUE at 100 %, which would authorise posting an
 * entire line of any size). `line.amount` here is the merged/logical line total.
 *
 * An unset or non-positive percentage yields 0, which disables the action. That is the configured
 * behaviour and it deliberately differs from `AutoMatchSupport.computeAmountTolerance`, which reads
 * the same column as "one cent of slack" when unset — see the backend class javadoc.
 *
 * @param {number} lineTotal original (logical) statement line amount
 * @param {number|null} amountTolerancePct the account's EM_ETGO_Amount_Tolerance
 * @returns {number} the maximum absolute remainder that may be posted
 */
export function differenceLimit(lineTotal, amountTolerancePct) {
  const pct = Number(amountTolerancePct) || 0;
  if (pct <= 0) return 0;
  return Math.abs(Number(lineTotal) || 0) * pct / 100;
}

/** True when the amount is small enough to be treated as zero. */
export function isNegligible(amount) {
  return Math.abs(Number(amount) || 0) < DIFFERENCE_EPSILON;
}

/**
 * Decides whether the difference banner is on offer for the selected line, and why not when it is
 * not. Mirrors the backend's preflight order so the UI never offers something the server rejects.
 *
 * The account's configured difference concept is deliberately NOT part of this decision. It only
 * preselects the modal's picker: the backend accepts any `glItemId` the modal sends and only falls
 * back to the account default when none is given, so a missing default is not a dead end — the user
 * picks one in the modal. The real guard is the modal's own confirm, disabled until a concept is
 * chosen ("never confirm an adjustment without a destination account").
 *
 * @param {object} args
 * @param {object|null} args.line the selected statement line (merged/logical row)
 * @param {number|null} [args.amountTolerance] the account's amount tolerance percentage
 * @param {boolean} [args.dismissed] the user pressed "Dejar pendiente" for this line this session
 * @returns {{visible: boolean, remainder: number, lineTotal: number, reconciled: number,
 *            limit: number, reason: string|null}}
 */
export function differenceState({ line, amountTolerance = null, dismissed = false }) {
  const lineTotal = Number(line?.amount) || 0;
  const remainder = Number(line?.pendingAmount) || 0;
  const reconciled = Number(line?.reconciledAmount) || 0;
  const limit = differenceLimit(lineTotal, amountTolerance);
  const hidden = { visible: false, remainder, lineTotal, reconciled, limit };

  // Only a PARTIAL line has a remainder to close: something must already be reconciled against it.
  if (!line || line.reconcileStatus !== 'PARTIAL' || isNegligible(reconciled)) {
    return { ...hidden, reason: 'notPartial' };
  }
  if (isNegligible(remainder)) {
    return { ...hidden, reason: 'balanced' };
  }
  if (dismissed) {
    return { ...hidden, reason: 'dismissed' };
  }
  // Out of tolerance is not a "blocked" banner but no banner at all: the remainder is too big to be
  // an adjustment, so the honest answer is to reconcile it against a real movement.
  if (Math.abs(remainder) > limit) {
    return { ...hidden, reason: 'outOfTolerance' };
  }
  return { visible: true, remainder, lineTotal, reconciled, limit, reason: null };
}
