import { useCallback, useEffect, useState } from 'react';
import { useAuthOptional } from '@etendosoftware/app-shell-core/auth';

const PREFIX = 'etendo.reports.panel.collapsed:';
const keyOf = (username) => `${PREFIX}${username || 'anonymous'}`;

// Storage can be absent or throw (private window, blocked site data): the panel works without it.
function read(username) {
  try { return localStorage.getItem(keyOf(username)) === '1'; } catch { return false; }
}
function write(username, collapsed) {
  try { localStorage.setItem(keyOf(username), collapsed ? '1' : '0'); } catch { /* not remembered */ }
}

/**
 * ETP-6239 D8 — whether "Personalizar informe" is hidden, remembered per username (the favorites
 * pattern). `setCollapsed(v, { persist })`: a manual toggle persists (default); the automatic hide on
 * Mes/Trimestre passes `persist: false`, so it lasts for the session only.
 */
export function useReportPanelCollapsed() {
  const username = useAuthOptional()?.username ?? null;
  const [collapsed, setState] = useState(() => read(username));
  useEffect(() => { setState(read(username)); }, [username]);
  const setCollapsed = useCallback((value, { persist = true } = {}) => {
    setState(value);
    if (persist) write(username, value);
  }, [username]);
  return { collapsed, setCollapsed };
}
