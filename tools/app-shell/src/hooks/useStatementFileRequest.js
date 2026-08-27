import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { authHeaders } from './financialAccountHttp';
import { getApiBase } from './useNeoResource';

/**
 * Shared plumbing for the two bank-statement file endpoints — `?action=preview`
 * (parse in memory, persist nothing) and `?action=import` (parse and persist).
 * They take the same body, authenticate the same way and surface backend
 * failures the same way, so only the action and the caller-facing flag name
 * differ; keeping the plumbing here stops the two hooks from being copies of
 * each other.
 */

const BASE_PATH = '/sws/neo/bank-statements';

/**
 * Builds the Error for a non-2xx response.
 *
 * The body is read as text and parsed by hand rather than with `res.json()`: a
 * NEO error body is JSON and carries a machine-readable `error.code` (e.g.
 * `NO_VALID_LINES`, which the import wizard maps to its own message), but a
 * proxy or gateway failure is not JSON at all, and then that raw text is the
 * only clue about what went wrong.
 *
 * @param {Response} res the failed response
 * @returns {Promise<Error>} an Error carrying `status` and, when present, `code`
 */
async function buildRequestError(res) {
  const raw = await res.text().catch(() => '');
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  const detail = raw ? `: ${raw}` : '';
  const error = new Error(parsed?.error?.message || `HTTP ${res.status}${detail}`);
  error.status = parsed?.error?.status ?? res.status;
  error.code = parsed?.error?.code ?? null;
  return error;
}

/**
 * POSTs a statement file to one of the two actions and returns its response data.
 *
 * @param {string} action `preview` or `import`
 * @param {string} token bearer token
 * @param {{ accountId: string, fileName: string, contentBase64: string }} payload
 * @returns {Promise<object>} the `response.data` payload (never null)
 */
export async function postStatementFile(action, token, { accountId, fileName, contentBase64 }) {
  const res = await fetch(`${getApiBase()}${BASE_PATH}?action=${action}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      FIN_Financial_Account_ID: accountId,
      fileName,
      contentBase64,
    }),
  });
  if (!res.ok) {
    throw await buildRequestError(res);
  }
  const json = await res.json();
  return json?.response?.data ?? {};
}

/**
 * Stateful wrapper around {@link postStatementFile}: tracks the in-flight flag
 * and the last error, and re-throws so the caller can branch on `err.code`.
 *
 * @param {string} action `preview` or `import`
 * @returns {{ run: (payload: object) => Promise<object>, busy: boolean, error: Error|null }}
 */
export function useStatementFileRequest(action) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (payload) => {
    setBusy(true);
    setError(null);
    try {
      return await postStatementFile(action, token, payload);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [action, token]);

  return { run, busy, error };
}
