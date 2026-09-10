import { useCallback, useMemo, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useNeoResource, getApiBase } from './useNeoResource';

const BASE_PATH = '/sws/neo/bank-reconciliation';

/**
 * Builds a query string from a flat params object, skipping null/undefined/empty
 * values and URL-encoding the rest. Returns '' when there is nothing to append.
 */
function buildQuery(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Shared POST hook for reconciliation actions. Deduplicates the fetch pattern
 * across reconcileGroup, applySuggestions, and any future POST actions.
 *
 * @param {string} action - The action query-param value.
 * @returns {{ post: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
function useNeoPost(action) {
  const apiFetch = useApiFetch(getApiBase());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const post = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${BASE_PATH}?action=${action}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      let json = null;
      try { json = await res.json(); } catch { json = null; }

      if (!res.ok) {
        const message = json?.error?.message || `HTTP ${res.status}`;
        const err = new Error(message);
        err.status = json?.error?.status ?? res.status;
        // Structured error bodies in this API carry more than a message: `code` (e.g.
        // GL_ITEM_REQUIRED, which tells the panel to ask for an accounting concept and retry) and
        // `remainderLineId` (which tells it to retarget a 409 at the pending sub-line). Dropping
        // them left callers with nothing but a toast, unable to act on a failure the server had
        // already diagnosed.
        err.body = json;
        err.code = json?.code ?? null;
        throw err;
      }
      return json?.response?.data ?? {};
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiFetch, action]);

  return { post, loading, error };
}

/**
 * Lists the pending statement lines for a financial account (left panel).
 *
 * GET /sws/neo/bank-reconciliation?action=pendingLines&accountId={id}
 *   optional filters: dateFrom, dateTo, q
 *
 * Response: { response: { data: { lines: [...], total, counts } } }
 *
 * @param {string|null} accountId
 * @param {{ dateFrom?: string, dateTo?: string, q?: string }} [filters]
 * @returns {{ lines: Array<object>, total: number, counts: object, loading: boolean, error: Error|null, reload: () => void }}
 */
export function usePendingStatementLines(accountId, filters = {}) {
  const { dateFrom, dateTo, q } = filters;

  const path = accountId
    ? `${BASE_PATH}${buildQuery({ action: 'pendingLines', accountId, dateFrom, dateTo, q })}`
    : null;

  const mapPayload = useMemo(
    () => (raw) => ({
      lines: Array.isArray(raw.lines) ? raw.lines : [],
      total: Number(raw.total ?? 0),
      counts: raw.counts ?? {},
      // Reconciliations of this account currently in draft. Core allows only one editable
      // reconciliation per account, so > 0 means a "Reactivar" will first confirm that draft.
      draftReconciliationCount: Number(raw.draftReconciliationCount ?? 0),
    }),
    [],
  );

  const { data, loading, error, reload } = useNeoResource({
    path,
    deps: [accountId, dateFrom, dateTo, q],
    mapPayload,
    label: 'usePendingStatementLines',
  });

  return {
    lines: data?.lines ?? [],
    total: data?.total ?? 0,
    counts: data?.counts ?? {},
    draftReconciliationCount: data?.draftReconciliationCount ?? 0,
    loading,
    error,
    reload,
  };
}

/**
 * Lists the candidate operations to reconcile against the selected line (right panel).
 *
 * GET /sws/neo/bank-reconciliation?action=candidates&accountId={id}&lineId={lineId}
 *
 * @param {string|null} accountId
 * @param {string|null} lineId
 * @param {string|null} [docType]
 * @param {string|null} [kind] 'invoices' to list unpaid invoices instead of transactions
 * @returns {{ candidates: Array<object>, loading: boolean, error: Error|null }}
 */
export function useCandidateOperations(accountId, lineId, docType = null, kind = null,
  dateFrom = null, dateTo = null) {
  const path = accountId && lineId
    ? `${BASE_PATH}${buildQuery({ action: 'candidates', accountId, lineId, docType, kind, dateFrom, dateTo })}`
    : null;

  const mapPayload = useMemo(
    () => (raw) => ({
      candidates: Array.isArray(raw.candidates) ? raw.candidates : [],
      counts: raw.counts ?? {},
    }),
    [],
  );

  const { data, loading, error } = useNeoResource({
    path,
    deps: [accountId, lineId, docType, kind, dateFrom, dateTo],
    mapPayload,
    label: 'useCandidateOperations',
  });

  return { candidates: data?.candidates ?? [], counts: data?.counts ?? {}, loading, error };
}

/**
 * Reconciles a statement line against a group of operations (POST).
 *
 * @returns {{ reconcile: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useReconcileGroup() {
  const { post, loading, error } = useNeoPost('reconcileGroup');
  return { reconcile: post, loading, error };
}

/**
 * Reactivates (un-reconciles) a previously reconciled statement line (POST).
 *
 * Undoes the reconciliation and deletes any payments auto-created by it.
 * Payload shape: { financialAccountId, statementLineId }.
 *
 * @returns {{ reactivate: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useReactivateReconciliation() {
  const { post, loading, error } = useNeoPost('reactivate');
  return { reactivate: post, loading, error };
}

/**
 * Un-reconciles a SINGLE operation ("desconciliar") from a statement line, leaving the rest of the
 * line's reconciliation intact (POST). For an auto-created invoice payment it also reverses the
 * payment and restores the invoice to unpaid.
 * Payload shape: { financialAccountId, statementLineId, transactionId }.
 *
 * @returns {{ removeOperation: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useRemoveOperation() {
  const { post, loading, error } = useNeoPost('removeOperation');
  return { removeOperation: post, loading, error };
}

/**
 * "Reactivar" — NO LONGER CALLED FROM THE UI. ETP-5135 removed the action from the Conciliación tab
 * (a processed reconciliation is a final state; Desconciliar is the only way out), but the NEO
 * endpoint is still served, so this wrapper is kept as the client for it — same as its sibling
 * {@link useReactivateReconciliation}, which has had no call site for a while either.
 *
 * <p>Same payload as `useRemoveOperation` ({ financialAccountId, statementLineId, transactionIds }).
 * It used to leave the reconciliation in DRAFT with its transactions still linked, but ETP-4502
 * iteration 7 reimplemented it as plain detach + reprocess — it now runs the exact same mechanics as
 * `removeOperation` and persists no draft. Auto-created invoice payments are fully removed.
 *
 * @returns {{ reactivateSelected: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useReactivateSelected() {
  const { post, loading, error } = useNeoPost('reactivateSelected');
  return { reactivateSelected: post, loading, error };
}

/**
 * Posts the unreconciled remainder of a PARTIALLY reconciled statement line to an accounting
 * concept, closing the line (POST).
 *
 * Payload shape: { financialAccountId, statementLineId, glItemId?, description? }. `statementLineId`
 * must be the remainder sub-line (`line.remainderLineId`), not the merged group head — the backend
 * answers 409 with the right id when the head is sent.
 *
 * Deliberately NO amount: the server recomputes the remainder from the line itself and ignores any
 * amount in the body, so the client cannot widen what gets written off.
 *
 * @returns {{ reconcileDifference: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useReconcileDifference() {
  const { post, loading, error } = useNeoPost('reconcileDifference');
  return { reconcileDifference: post, loading, error };
}

/**
 * Fetches an automatch preview for a financial account (GET, no mutations).
 *
 * @param {string|null} accountId
 * @returns {{ groups: Array<object>, kpis: object, loading: boolean, error: Error|null, reload: () => void }}
 */
export function useAutoMatch(accountId) {
  const path = accountId
    ? `${BASE_PATH}${buildQuery({ action: 'autoMatch', accountId })}`
    : null;

  const defaultKpis = { pendingLines: 0, groupsFound: 0, opsToLink: 0, willCreate: 0 };

  const mapPayload = useMemo(
    () => (raw) => ({
      groups: Array.isArray(raw.groups) ? raw.groups : [],
      kpis: raw.kpis ?? defaultKpis,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { data, loading, error, reload } = useNeoResource({
    path,
    deps: [accountId],
    mapPayload,
    label: 'useAutoMatch',
  });

  return {
    groups: data?.groups ?? [],
    kpis: data?.kpis ?? defaultKpis,
    loading,
    error,
    reload,
  };
}

/**
 * Applies accepted automatch suggestion groups (POST, commits transactions + reconciliations).
 *
 * @returns {{ apply: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useApplySuggestions() {
  const { post, loading, error } = useNeoPost('applySuggestions');
  return { apply: post, loading, error };
}
