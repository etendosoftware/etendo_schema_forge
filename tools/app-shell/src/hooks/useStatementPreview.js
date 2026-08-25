import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource';

/**
 * Hook for the multi-step "Importar extracto" modal. Calls
 *   POST /sws/neo/bank-statements?action=preview
 * which parses the file in-memory on the backend, computes totals and
 * returns the parsed lines WITHOUT persisting anything to the DB.
 *
 * Body: { FIN_Financial_Account_ID, fileName, contentBase64 }
 *
 * Response data shape:
 *   {
 *     format: 'C43' | 'GENERIC_CSV',
 *     fileName: string,
 *     lineCount: number,
 *     totalIn: number,
 *     totalOut: number,
 *     periodFrom: string,        // ISO date
 *     periodTo: string,          // ISO date
 *     lines: Array<{ lineNo, date, description, bpartnerName, reference, cramount, dramount }>,
 *   }
 *
 * @returns {{
 *   previewStatement: (payload: { accountId, fileName, contentBase64 }) => Promise<object>,
 *   previewing: boolean,
 *   error: Error|null,
 * }}
 */
export function useStatementPreview() {
  const { token } = useAuth();
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState(null);

  const previewStatement = useCallback(async ({ accountId, fileName, contentBase64 }) => {
    const url = `${getApiBase()}/sws/neo/bank-statements?action=preview`;
    setPreviewing(true);
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
      setPreviewing(false);
    }
  }, [token]);

  return { previewStatement, previewing, error };
}
