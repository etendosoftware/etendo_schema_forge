import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { buildHeaders, detectBaseUrl } from '@/auth/api.js';

/**
 * Per-user, per-window named filter presets backed by
 * AD_Preference (ETGO_WindowFilters).
 *
 * Server endpoints (NeoServlet):
 *   GET    /sws/neo/filters/{window}
 *   PUT    /sws/neo/filters/{window}/{preset}
 *   DELETE /sws/neo/filters/{window}/{preset}
 *
 * A preset payload is an opaque JSON object; this hook does not interpret it.
 * Callers decide what to put in (e.g., { columnFilters, advancedFilter }).
 */
export function useWindowFilterPresets(windowName) {
  const { isAuthenticated, csrfToken } = useAuth();
  const [presets, setPresets] = useState({});
  const [loading, setLoading] = useState(false);

  const baseUrl = useCallback(
    () => `${detectBaseUrl()}/sws/neo/filters/${encodeURIComponent(windowName || '')}`,
    [windowName],
  );

  const refresh = useCallback(() => {
    if (!windowName || !isAuthenticated) return;
    setLoading(true);
    fetch(baseUrl(), { headers: buildHeaders(), credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        setPresets(data && typeof data === 'object' ? data : {});
      })
      .catch(() => setPresets({}))
      .finally(() => setLoading(false));
  }, [windowName, isAuthenticated, baseUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const savePreset = useCallback(
    async (presetName, payload) => {
      if (!windowName || !isAuthenticated || !presetName) return;
      const url = `${baseUrl()}/${encodeURIComponent(presetName)}`;
      await fetch(url, {
        method: 'PUT',
        // ETP-4576 — unsafe method: the backend requires the CSRF proof.
        headers: csrfToken ? { ...buildHeaders(), 'X-Go-CSRF': csrfToken } : buildHeaders(),
        body: JSON.stringify(payload ?? {}),
        credentials: 'include',
      });
      setPresets((prev) => ({ ...prev, [presetName]: payload ?? {} }));
    },
    [windowName, isAuthenticated, csrfToken, baseUrl],
  );

  const deletePreset = useCallback(
    async (presetName) => {
      if (!windowName || !isAuthenticated || !presetName) return;
      const url = `${baseUrl()}/${encodeURIComponent(presetName)}`;
      await fetch(url, {
        method: 'DELETE',
        // ETP-4576 — unsafe method: the backend requires the CSRF proof.
        headers: csrfToken ? { ...buildHeaders(), 'X-Go-CSRF': csrfToken } : buildHeaders(),
        credentials: 'include',
      });
      setPresets((prev) => {
        const next = { ...prev };
        delete next[presetName];
        return next;
      });
    },
    [windowName, isAuthenticated, csrfToken, baseUrl],
  );

  return { presets, loading, refresh, savePreset, deletePreset };
}

export default useWindowFilterPresets;
