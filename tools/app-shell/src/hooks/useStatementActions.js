import { useCallback, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from './useNeoResource';
import { parseBackendErrorMessage } from '@/lib/backendErrors.js';

/**
 * Write actions for an existing bank statement: process, reactivate, update and
 * delete. All target the same NEO endpoint with a different `action`. process /
 * update / delete are only valid for drafts; reactivate is only valid for
 * processed statements (the backend rejects the wrong state with 400).
 *
 * - process:    POST ?action=process    body { id }
 * - reactivate: POST ?action=reactivate body { id }
 * - update:     POST ?action=update     body { id, name, transactionDate, importDate,
 *                                              fileName, notes, process, lines }
 * - delete:     POST ?action=delete     body { id }
 *
 * @returns {{
 *   processStatement: (id: string) => Promise<object>,
 *   reactivateStatement: (id: string) => Promise<object>,
 *   updateStatement: (payload: object) => Promise<object>,
 *   deleteStatement: (id: string) => Promise<object>,
 *   busy: boolean,
 *   error: Error|null,
 * }}
 */
export function useStatementActions() {
  const apiFetch = useApiFetch(getApiBase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const post = useCallback(async (action, body) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/sws/neo/bank-statements?action=${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // NEO wraps a rejected action's reason as { error: { message } } (e.g. "Only draft
        // (unprocessed) statements can be modified" from BankStatementsHandler.requireDraft) — the
        // caller translates and shows it (ETP-4921: a bulk-delete failure used to surface only
        // "None of the N selected could be deleted", with no hint that the reason was a processed
        // statement). Falls back to the raw HTTP status when the body isn't the expected shape.
        const message = await parseBackendErrorMessage(res);
        throw new Error(message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      return json?.response?.data ?? {};
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [apiFetch]);

  const processStatement = useCallback((id) => post('process', { id }), [post]);

  const reactivateStatement = useCallback((id) => post('reactivate', { id }), [post]);

  const updateStatement = useCallback(({
    id, name, transactionDate, importDate, fileName, notes, process = false, lines,
  }) => post('update', {
    id, name, transactionDate, importDate, fileName, notes, process, lines,
  }), [post]);

  const deleteStatement = useCallback((id) => post('delete', { id }), [post]);

  return { processStatement, reactivateStatement, updateStatement, deleteStatement, busy, error };
}
