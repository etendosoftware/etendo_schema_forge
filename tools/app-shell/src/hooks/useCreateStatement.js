import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource';

/**
 * Hook for creating a bank statement manually (header + lines, no file).
 *
 * POST /sws/neo/bank-statements?action=create
 * body: {
 *   FIN_Financial_Account_ID, name, transactionDate, importDate,
 *   lines: [{ date, description, bpartnerName, in, out }]
 * }
 *
 * @returns {{
 *   createStatement: (payload: {
 *     accountId: string, name: string, transactionDate: string,
 *     importDate: string, fileName?: string, notes?: string, process?: boolean,
 *     lines: Array<{ date: string, reference?: string, description?: string,
 *                    bpartnerName?: string, bpartnerId?: string|null,
 *                    glItemId?: string|null, in?: number, out?: number }>
 *   }) => Promise<object>,
 *   creating: boolean,
 *   error: Error|null
 * }}
 */
export function useCreateStatement() {
  const { token } = useAuth();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const createStatement = useCallback(async ({
    accountId, name, transactionDate, importDate, fileName, notes, process = true, lines,
  }) => {
    const url = `${getApiBase()}/sws/neo/bank-statements?action=create`;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          FIN_Financial_Account_ID: accountId,
          name,
          transactionDate,
          importDate,
          fileName,
          notes,
          process,
          lines,
        }),
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
      setCreating(false);
    }
  }, [token]);

  return { createStatement, creating, error };
}
