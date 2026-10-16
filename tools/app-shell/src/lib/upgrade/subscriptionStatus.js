/**
 * Stripe's live subscription statuses that are healthy enough to promise a future renewal. A
 * `past_due` subscription still carries a `renewalAt`, but it is the next invoice-retry date, not
 * a renewal; showing it as one reads as reassurance the account does not have (ETP-5443 REVIEW
 * W5). Shared by every surface that prints a renewal date.
 */
export const RENEWING_STATUSES = new Set(['active', 'trialing']);
