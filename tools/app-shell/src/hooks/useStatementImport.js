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
  const { token } = useAuth();
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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          FIN_Financial_Account_ID: accountId,
          fileName,
          contentBase64,
        }),
      });
      if (!res.ok) {
        // Read the failure body as text and parse it ourselves: a NEO error body
        // is JSON and carries `error.code`, but a proxy/gateway failure is not,
        // and that raw text is then the only clue about what went wrong.
        const raw = await res.text().catch(() => '');
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
        const detail = raw ? `: ${raw}` : '';
        const err = new Error(parsed?.error?.message || `HTTP ${res.status}${detail}`);
        err.status = parsed?.error?.status ?? res.status;
        // Stable machine-readable code (e.g. NO_VALID_LINES) so the caller can
        // show a translated message instead of a generic failure.
        err.code = parsed?.error?.code ?? null;
        throw err;
      }
      const json = await res.json();
      return json?.response?.data ?? {};
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setImporting(false);
    }
  }, [token]);

  return { importStatement, importing, error };
}
