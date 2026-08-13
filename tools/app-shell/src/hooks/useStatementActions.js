import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource';

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
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const post = useCallback(async (action, body) => {
    const url = `${getApiBase()}/sws/neo/bank-statements?action=${action}`;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const detail = text ? `: ${text}` : '';
        throw new Error(`HTTP ${res.status}${detail}`);
      }
      const json = await res.json();
      return json?.response?.data ?? {};
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [token]);

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
