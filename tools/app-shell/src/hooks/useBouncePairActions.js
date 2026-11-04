import { useCallback } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from './useNeoResource';
import { RECONCILIATION_BASE_PATH, useReconciliationPost } from './useReconciliationPost.js';

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
 * linked to, clearing the link. A line discarded on its own is restored alone. Gated like
 * `discardPair`: behind the backend flag `bank-bounce-suggestions` (403 `BOUNCE_SUGGESTIONS_OFF`
 * otherwise). With the flag off the way to undo a discard is Etendo Classic's PSD2 Restore.
 * Payload: `{ financialAccountId, lineId }` → `{ restored: [ids], lineId, counterpartLineId }`.
 *
 * @returns {{ restorePair: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useRestorePair() {
  const { post, loading, error } = useReconciliationPost('restorePair');
  return { restorePair: post, loading, error };
}

/**
 * Reports "No es un rechazo" (POST `dismissPair`, ETP-5581): the user said a suggested pair is not a
 * bounce. Nothing is persisted — the backend only emits the KPI event (`decision=unchecked`,
 * `surface=panel`); the pair stays hidden for the session on the client side alone. Callers fire it
 * and forget it: a failure must change nothing on screen.
 * Payload: `{ financialAccountId, statementLineId, counterpartLineId? }` (the selected line and, when
 * the card shows one, the other line of the pair).
 *
 * @returns {{ dismissPair: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useDismissPair() {
  const { post, loading, error } = useReconciliationPost('dismissPair');
  return { dismissPair: post, loading, error };
}

/**
 * Fetches the per-state counts of the default `pendingLines` answer (no `status`), for the given
 * date range. The left panel shows "Descartadas" from a request of its own (`status=discarded`)
 * whose counts carry only `discarded`; after a restore there the other filters' counts are stale,
 * and this refreshes them without leaving the filter. Lives here, not in `useReconciliation.js`,
 * for the same reason as `useReconciliationPost` (the component suites mock that module).
 *
 * @returns {(args: { financialAccountId: string, dateFrom?: string, dateTo?: string })
 *   => Promise<object|null>} the counts, or null when the answer has none
 */
export function usePendingLineCounts() {
  const apiFetch = useApiFetch(getApiBase());
  return useCallback(async ({ financialAccountId, dateFrom, dateTo }) => {
    const params = new URLSearchParams({ action: 'pendingLines', accountId: financialAccountId });
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const res = await apiFetch(`${RECONCILIATION_BASE_PATH}?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json?.response?.data?.counts ?? null;
  }, [apiFetch]);
}
