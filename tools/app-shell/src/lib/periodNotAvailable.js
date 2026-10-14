/**
 * ETP-5577 — the way out of a "period not open" refusal (`messageKeys` `PeriodNotAvailable`).
 *
 * A productive tenant starts with every accounting period never-opened, so its first completion,
 * payment or posting is refused until someone opens the period. While the calendar review is
 * pending, the refusal toast sends the owner to "Revisar calendario contable" (First Steps) and
 * tells anyone else to ask the owner; afterwards it offers "Ir al calendario".
 *
 * The toasts are raised from hooks that may run outside the router, so the app layout, which is
 * inside it, registers the action here.
 */

export const PERIOD_NOT_AVAILABLE_KEY = 'PeriodNotAvailable';

let recovery = null;

/**
 * @param {{ labelKey: string, go: () => void } | { descriptionKey: string } | null} next an action,
 *   a hint, or null to clear it
 */
export function setPeriodRecovery(next) {
  recovery = next;
}

/**
 * Recovery for the current tenant, from its calendar review state (`GET calendar-review`):
 * `pending` and `isOwner`.
 */
export function periodRecoveryFor(review, navigate) {
  if (!review?.pending) {
    return { labelKey: 'periodNotAvailableOpenCalendar', go: () => navigate('/calendar') };
  }
  return review.isOwner
    ? { labelKey: 'periodNotAvailableReviewCalendar', go: () => navigate('/first-steps') }
    : { descriptionKey: 'periodNotAvailableAskOwner' };
}

/**
 * Extra sonner options for a refusal toast: the recovery action (or the hint) when the refusal is
 * keyed `PeriodNotAvailable`, nothing otherwise.
 *
 * @param {string[]|undefined} messageKeys the refusal's identity (`extractBackendMessageKeys`)
 * @param {(key: string) => string} ui the UI translator
 */
export function periodNotAvailableToastOptions(messageKeys, ui) {
  if (!recovery || !messageKeys?.includes(PERIOD_NOT_AVAILABLE_KEY)) return {};
  if (recovery.descriptionKey) return { description: ui(recovery.descriptionKey) };
  return { action: { label: ui(recovery.labelKey), onClick: recovery.go } };
}
