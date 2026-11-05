import { useCallback, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from './useNeoResource';

/** NEO route of every bank reconciliation action. */
export const RECONCILIATION_BASE_PATH = '/sws/neo/bank-reconciliation';

/**
 * Shared POST hook for the bank reconciliation actions (`reconcileGroup`, `applySuggestions`,
 * `discardPair`, …). One fetch pattern for all of them.
 *
 * Lives in its own module, not in `useReconciliation.js`, because the reconciliation component
 * suites mock `@/hooks/useReconciliation` with a factory that lists only the hooks they use: a
 * module that needs this helper (the bounce-pair actions, ETP-5581) must reach it without going
 * through that mock.
 *
 * @param {string} action - The action query-param value.
 * @returns {{ post: (payload: object) => Promise<object>, loading: boolean, error: Error|null }}
 */
export function useReconciliationPost(action) {
  const apiFetch = useApiFetch(getApiBase());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const post = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${RECONCILIATION_BASE_PATH}?action=${action}`, {
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
