// ETP-4830 (item #4) — dev-only debug mode for the Users window, so admin-created-user testing
// and the pending-invitation pill's states (PendingInvitationPill in index.jsx) can be exercised
// without a real email round-trip. Same shape as fiscal-monitor's own useDebugMode.js (module-
// level keystroke buffer + a Set of React listeners, localStorage-backed) — deliberately NOT
// imported from there: separate module, separate localStorage key, separate keystroke sequence,
// so the two debug modes stay fully independent (see docs/generated-custom-windows/fiscal-monitor.md
// for that original convention).
const STORAGE_KEY = 'etendo-debug-user';
const SEQUENCE    = 'debuguser';

let buffer    = '';
let listeners = new Set();

function getActive() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function setActive(v) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch {}
  listeners.forEach(fn => fn(v));
}

// Registers the keydown listener only in a dev build (Vite's import.meta.env.DEV, false in every
// production build with zero extra config needed) — the panel this hook gates cannot even be
// discovered by typing the sequence in production. Stronger guarantee than the opt-in
// VITE_SHOW_ARTIFACTS === 'true' precedent (SideMenu.jsx) would give here: this listener has no
// role check of its own before the panel renders (unlike that admin-only sidebar item), so
// tying it to the build mode rather than a settable env var is the safer default. The backend's
// own GoRuntimeProperties flag (see com.etendoerp.go's SFDebugInvitationBypass) remains the real
// security boundary regardless — this is a discoverability nicety on top, not a substitute.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const ch = e.key.length === 1 ? e.key.toLowerCase() : '';
    if (!ch) return;
    buffer = (buffer + ch).slice(-SEQUENCE.length);
    if (buffer === SEQUENCE) {
      const next = !getActive();
      setActive(next);
      buffer = '';
      console.info(`[Debug] User debug mode ${next ? 'ON' : 'OFF'}`);
    }
  });
}

import { useState, useEffect } from 'react';

export function useUserDebugMode() {
  const [active, setLocalActive] = useState(getActive);

  useEffect(() => {
    const handler = (v) => setLocalActive(v);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  return active;
}
