import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestNavigation } from '@/lib/unsavedChanges.js';

/**
 * `useNavigate`, but it asks before throwing away unsaved changes (ETP-5073 / DOC-08).
 *
 * Use this instead of `useNavigate` for any navigation that can happen while a form is being
 * edited — the side menu, a record link, a "back to list" button. Navigations that cannot
 * (inside a wizard that owns its own guard, or right after a successful save) may keep using
 * `useNavigate` directly.
 *
 * Why not react-router's `useBlocker`: v7 serves it only from a data router, and this app mounts
 * a declarative `<BrowserRouter>` in `AppShellRuntime`. See the navigation-guard section of
 * `lib/unsavedChanges.js` for the full reasoning.
 *
 * The returned function keeps `useNavigate`'s signature, so it is a drop-in replacement — but it
 * returns nothing, because the navigation may happen later (after the user answers the prompt)
 * or not at all.
 *
 * @returns {(...args: unknown[]) => void} a guarded navigate
 */
export function useGuardedNavigate() {
  const navigate = useNavigate();
  return useCallback((...args) => {
    requestNavigation(() => navigate(...args));
  }, [navigate]);
}

export default useGuardedNavigate;
