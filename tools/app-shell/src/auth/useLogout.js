import { useCallback } from 'react';
import { useAuthOptional, notifyAmbientUnauthorized } from '@etendosoftware/app-shell-core/auth';
import { clearStoredDateRange } from '@/components/dashboard/DashboardDateRangeContext.jsx';

/**
 * Returns a logout function that resets session-scoped UI state (the dashboard
 * period filter) before delegating to the core logout.
 *
 * Use this everywhere instead of `useAuth().logout` so that EVERY exit path —
 * the user menu, the post-password-change flow, and the automatic 401
 * auto-logout wired into api fetch helpers — clears the persisted period range.
 * Centralizing here avoids the "forgot to clear on this path" class of bug.
 *
 * Reads the session with `useAuthOptional` rather than `useAuth`, so it does not throw in a
 * tree with no `AuthProvider` above it: `useApiFetch` (the 401 path) is one of its callers
 * and is used by ~100 components whose tests render them bare (ETP-5022). With no provider
 * it falls back to the ambient session's logout handler, and the clear still happens.
 */
export function useLogout() {
  const auth = useAuthOptional();
  const logout = auth?.logout;
  return useCallback(() => {
    clearStoredDateRange();
    (logout || notifyAmbientUnauthorized)();
  }, [logout]);
}
