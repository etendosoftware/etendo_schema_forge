import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useNeoResource, getApiBase } from './useNeoResource';

/**
 * Data access for the cash-close screen of cash-type financial accounts (ETP-4795).
 *
 * Backed by its own NEO spec (`cash-close`, handler `@Named("cashClose")`) rather than
 * `bank-reconciliation`: a cash account has no bank statements, and Core keeps the two flows
 * deliberately separate — one reconciliation document can never mix statement-backed and
 * cash-only lines.
 *
 * Mirrors the conventions of `useReconciliation.js` exactly (BASE_PATH + buildQuery + a shared
 * `useNeoPost` factory + `useNeoResource` for the read).
 */

const BASE_PATH = '/sws/neo/cash-close';

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
 * Shared POST hook for the cash-close actions (saveDraft / confirm / discardDraft).
 *
 * @param {string} action - The action query-param value.
 * @returns {{ post: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
function useNeoPost(action) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const post = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const url = `${getApiBase()}${BASE_PATH}?action=${action}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let json = null;
      try { json = await res.json(); } catch { json = null; }

      if (!res.ok) {
        const message = json?.error?.message || `HTTP ${res.status}`;
        const err = new Error(message);
        err.status = json?.error?.status ?? res.status;
        throw err;
      }
      return json?.response?.data ?? {};
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token, action]);

  return { post, loading, error };
}

/**
 * Everything the cash-close screen needs in one read: the account's opening balance (the ending
 * balance of its last confirmed close, or its initial balance), the accounting concept configured
 * for differences, the current draft (if the user saved one earlier) and every movement still
 * available to close.
 *
 * GET /sws/neo/cash-close?action=pending&accountId={id}
 *
 * @param {string|null} accountId
 * @returns {{
 *   account: object|null, openingBalance: number, lastCloseDate: string|null,
 *   glItemDifference: {id: string, name: string}|null, draft: object|null,
 *   movements: Array<object>, loading: boolean, error: Error|null, reload: () => void
 * }}
 */
export function useCashClosePending(accountId) {
  const path = accountId
    ? `${BASE_PATH}${buildQuery({ action: 'pending', accountId })}`
    : null;

  const mapPayload = useMemo(
    () => (raw) => ({
      account: raw.account ?? null,
      openingBalance: Number(raw.openingBalance ?? 0),
      lastCloseDate: raw.lastCloseDate ?? null,
      glItemDifference: raw.glItemDifference ?? null,
      draft: raw.draft ?? null,
      movements: Array.isArray(raw.movements) ? raw.movements : [],
    }),
    [],
  );

  const { data, loading, error, reload } = useNeoResource({
    path,
    deps: [accountId],
    mapPayload,
    label: 'useCashClosePending',
  });

  return {
    account: data?.account ?? null,
    openingBalance: data?.openingBalance ?? 0,
    lastCloseDate: data?.lastCloseDate ?? null,
    glItemDifference: data?.glItemDifference ?? null,
    draft: data?.draft ?? null,
    movements: data?.movements ?? [],
    loading,
    error,
    reload,
  };
}

/**
 * Saves the close as a draft without completing it, so the user can walk away and come back.
 * Body: `{ accountId, statementDate, declaredBalance, movementIds: [...] }`.
 */
export function useSaveCashCloseDraft() {
  const { post, loading, error } = useNeoPost('saveDraft');
  return { saveDraft: post, loading, error };
}

/**
 * Completes the close: validates the date and the accounting period, posts the difference against
 * the account's GL Item Difference when there is one, pushes forward the date of any movement
 * dated after the close, and marks the reconciliation as completed. Same body as `saveDraft`.
 */
export function useConfirmCashClose() {
  const { post, loading, error } = useNeoPost('confirm');
  return { confirmClose: post, loading, error };
}

/** Drops the account's current draft so the user can start the close over. Body: `{ accountId }`. */
export function useDiscardCashCloseDraft() {
  const { post, loading, error } = useNeoPost('discardDraft');
  return { discardDraft: post, loading, error };
}
