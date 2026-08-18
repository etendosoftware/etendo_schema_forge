import { useCallback, useState } from 'react';
import { writeHeaders } from '@/lib/sessionHeaders.js';
import { trackTransactionPosted } from '@/lib/observability/health-events.js';

/**
 * Invokes Etendo DocAction buttons via NEO Headless.
 * POST {apiBaseUrl}/{entity}/{recordId}/action/documentAction { docAction }
 */
export function useDocumentAction({ apiBaseUrl, entity = 'header' } = {}) {
  // ETP-4576 — no credential is threaded in any more: the session is the
  // `__Host-` cookie. This hook only needs the CSRF proof, which it reads from
  // the auth context itself, so callers stop passing a token.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

    const execute = useCallback(async (recordId, docAction, { onSuccess, onError } = {}) => {
    if (!recordId || !docAction) {
      const err = new Error('useDocumentAction.execute requires recordId and docAction');
      setError(err.message);
      onError?.(err);
      throw err;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/${entity}/${recordId}/action/documentAction`,
        { method: 'POST', headers: writeHeaders(), credentials: 'include', body: JSON.stringify({ docAction }) },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message = payload?.response?.message || payload?.message || `Error ${res.status}`;
        const err = new Error(message);
        err.status = res.status;
        err.payload = payload;
        throw err;
      }
      const data = await res.json().catch(() => null);
      onSuccess?.(data);
      trackTransactionPosted();
      return data;
    } catch (err) {
      setError(err.message || 'Action failed');
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, entity]);

  const clearError = useCallback(() => setError(null), []);

  return { execute, loading, error, clearError };
}

export default useDocumentAction;
