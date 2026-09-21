import { useCallback, useState } from 'react';
import { trackTransactionPosted } from '@/lib/observability/health-events.js';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { extractBackendMessageKeys } from '@/lib/backendErrors.js';
/**
 * Invokes Etendo DocAction buttons via NEO Headless.
 * POST {apiBaseUrl}/{entity}/{recordId}/action/documentAction { docAction }
 */
export function useDocumentAction({ apiBaseUrl, entity = 'header', token } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const apiFetch = useApiFetch(apiBaseUrl);

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
      const res = await apiFetch(
        `/${entity}/${recordId}/action/documentAction`,
        { method: 'POST', body: JSON.stringify({ docAction }) },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message = payload?.response?.message || payload?.message || `Error ${res.status}`;
        const err = new Error(message);
        err.status = res.status;
        err.payload = payload;
        // ETP-5316 — the AD_MESSAGE search keys behind `message`, lifted to a named field on the
        // Error so a consumer can hand them to `translateBackendError` without re-deriving the
        // envelope shape from `payload`. `undefined` when the backend did not send them (older
        // deployment), which is exactly the input `translateBackendError` treats as "text only".
        err.messageKeys = extractBackendMessageKeys(payload);
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
  }, [entity, apiFetch]);

  const clearError = useCallback(() => setError(null), []);

  return { execute, loading, error, clearError };
}

export default useDocumentAction;
