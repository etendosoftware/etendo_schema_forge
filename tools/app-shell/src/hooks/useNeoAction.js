import { useCallback, useMemo, useState } from 'react';

/**
 * useNeoAction — invokes a generic NEO action endpoint (ETP-4298).
 *
 * Backend handles `POST {apiBaseUrl}/{entityName}/{recordId}/action/{actionName}`
 * server-side (e.g. actionName = 'post' / 'unpost'). This mirrors
 * `useDocumentAction`'s URL convention: `apiBaseUrl` is ALREADY scoped to the
 * spec (e.g. `/sws/neo/sales-order`), so `specName` is NOT prepended to the URL.
 * It is accepted as an option for symmetry with the menuAction config / future
 * use, but the live endpoint does not repeat the spec segment.
 *
 * `entityName` follows the same convention as `useDocumentAction.entity`
 * (defaults to 'header' — the document header entity).
 *
 * Unlike useDocumentAction (which throws on error), this hook resolves to a
 * structured `{ success, message }` result so the RowQuickActions consumer can
 * forward it to `onMenuActionExecuted(action, result)` without try/catch.
 *
 * @param {object}  opts
 * @param {string}  opts.specName   - spec name (kept for symmetry; not used in URL)
 * @param {string} [opts.entityName='header'] - entity segment of the action URL
 * @param {string}  opts.apiBaseUrl - base URL already scoped to the spec
 * @param {string}  opts.token      - bearer token
 * @returns {{ execute: (recordId: string, actionName: string) => Promise<{success: boolean, message?: string}>, loading: boolean }}
 */
export function useNeoAction({ specName: _specName, entityName = 'header', apiBaseUrl, token } = {}) {
  const [loading, setLoading] = useState(false);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const execute = useCallback(async (recordId, actionName) => {
    if (!apiBaseUrl || !recordId || !actionName) {
      return { success: false, message: `Missing required params: apiBaseUrl=${apiBaseUrl}, recordId=${recordId}, actionName=${actionName}` };
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/${entityName}/${encodeURIComponent(recordId)}/action/${encodeURIComponent(actionName)}`,
        { method: 'POST', headers, body: '{}' },
      );
      const body = await res.json().catch(() => null);
      const nested = body?.response?.data?.[0];
      const message = nested?.message ?? body?.response?.message ?? body?.message;
      if (!res.ok) {
        return { success: false, message: message || res.statusText };
      }
      const success = nested?.success ?? body?.success ?? true;
      return { success, message };
    } catch (err) {
      return { success: false, message: err?.message || 'Network error' };
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, entityName, headers]);

  return { execute, loading };
}

export default useNeoAction;
