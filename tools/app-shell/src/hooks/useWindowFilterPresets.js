import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';

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
  const { token } = useAuth();
  const apiFetch = useApiFetch();
  const [presets, setPresets] = useState({});
  const [loading, setLoading] = useState(false);

  const path = useCallback(
    () => `/sws/neo/filters/${encodeURIComponent(windowName || '')}`,
    [windowName],
  );

  const refresh = useCallback(() => {
    if (!windowName) return;
    setLoading(true);
    apiFetch(path())
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        setPresets(data && typeof data === 'object' ? data : {});
      })
      .catch(() => setPresets({}))
      .finally(() => setLoading(false));
  }, [windowName, token, path, apiFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const savePreset = useCallback(
    async (presetName, payload) => {
      if (!windowName || !presetName) return;
      const url = `${path()}/${encodeURIComponent(presetName)}`;
      await apiFetch(url, {
        method: 'PUT',
        body: JSON.stringify(payload ?? {}),
      });
      setPresets((prev) => ({ ...prev, [presetName]: payload ?? {} }));
    },
    [windowName, token, path, apiFetch],
  );

  const deletePreset = useCallback(
    async (presetName) => {
      if (!windowName || !presetName) return;
      const url = `${path()}/${encodeURIComponent(presetName)}`;
      await apiFetch(url, { method: 'DELETE' });
      setPresets((prev) => {
        const next = { ...prev };
        delete next[presetName];
        return next;
      });
    },
    [windowName, token, path, apiFetch],
  );

  return { presets, loading, refresh, savePreset, deletePreset };
}

export default useWindowFilterPresets;
