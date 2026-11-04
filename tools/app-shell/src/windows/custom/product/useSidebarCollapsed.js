import { useCallback, useState } from 'react';

// Single global UI preference (not per product): is the product side panel collapsed to its strip
// (ETP-5908 RF-16). Storage can be unavailable or blocked, so every access is guarded and the
// state still works in memory.
export const SIDEBAR_COLLAPSED_KEY = 'etendo.product.sidebar.collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(value) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
  } catch { /* storage unavailable: keep the in-memory state only */ }
}

export function useSidebarCollapsed() {
  // Lazy initialiser: read synchronously so a collapsed panel does not flash open on reload.
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const setCollapsed = useCallback((value) => {
    setCollapsedState(value);
    writeCollapsed(value);
  }, []);
  return [collapsed, setCollapsed];
}
