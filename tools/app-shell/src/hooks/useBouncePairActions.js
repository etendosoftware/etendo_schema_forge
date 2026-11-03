import { useReconciliationPost } from './useReconciliationPost.js';

/*
 * ── Bounce pairs (ETP-5581) ─────────────────────────────────────────────────────────────────────
 * The two panel actions on a bounce pair. Both go through `bank-reconciliation`, like every other
 * reconciliation write; the window's read-only tier is enforced by the callers. Refusals are coded
 * (`code` + `error.messageKeys`, English AD messages): translate them with
 * `translateBackendErrorBody(err.body, ui, fallback)`.
 */

/**
 * Discards a bounce pair (POST `discardPair`): both lines are discarded and linked to each other.
 * Behind the backend flag `bank-bounce-suggestions` (403 `BOUNCE_SUGGESTIONS_OFF` otherwise).
 * Payload: `{ financialAccountId, statementLineId, counterpartLineId }` (the original and the
 * bounce) → `{ discarded: true, statementLineId, counterpartLineId, signal, confidence }`.
 *
 * @returns {{ discardPair: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useDiscardPair() {
  const { post, loading, error } = useReconciliationPost('discardPair');
  return { discardPair: post, loading, error };
}

/**
 * Restores the pair of a discarded line (POST `restorePair`): the line AND the counterpart it is
 * linked to, clearing the link. A line discarded on its own is restored alone. Not gated by the
 * flag, so a pair can always be undone.
 * Payload: `{ financialAccountId, lineId }` → `{ restored: [ids], lineId, counterpartLineId }`.
 *
 * @returns {{ restorePair: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useRestorePair() {
  const { post, loading, error } = useReconciliationPost('restorePair');
  return { restorePair: post, loading, error };
}
