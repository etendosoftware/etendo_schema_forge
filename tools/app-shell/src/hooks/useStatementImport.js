import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource';

/**
 * Hook for importing a C43 bank statement file.
 *
 * POST /sws/neo/bank-statements?action=import
 * body: { FIN_Financial_Account_ID, fileName, contentBase64 }
 *
 * @returns {{
 *   importStatement: (payload: { accountId: string, fileName: string, contentBase64: string }) => Promise<object>,
 *   importing: boolean,
 *   error: Error|null
 * }}
 */
export function useStatementImport() {
  const { csrfToken } = useAuth();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  const importStatement = useCallback(async ({ accountId, fileName, contentBase64 }) => {
    const apiBase = getApiBase();
    const url = `${apiBase}/sws/neo/bank-statements?action=import`;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        // ETP-4576 — authenticates with the `__Host-` session cookie instead of a
        // bearer token. Unsafe method, so the backend also requires the CSRF proof.
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-Go-CSRF': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          FIN_Financial_Account_ID: accountId,
          fileName,
          contentBase64,
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
      setImporting(false);
    }
  }, [csrfToken]);

  return { importStatement, importing, error };
}
