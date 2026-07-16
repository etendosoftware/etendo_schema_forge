import { useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { clearStoredDateRange } from '@/components/dashboard/DashboardDateRangeContext.jsx';

/**
 * Returns a logout function that resets session-scoped UI state (the dashboard
 * period filter) before delegating to the core logout.
 *
 * Use this everywhere instead of `useAuth().logout` so that EVERY exit path —
 * the user menu, the post-password-change flow, and the automatic 401
 * auto-logout wired into api fetch helpers — clears the persisted period range.
 * Centralizing here avoids the "forgot to clear on this path" class of bug.
 */
export function useLogout() {
  const { logout } = useAuth();
  return useCallback(() => {
    clearStoredDateRange();
    logout();
  }, [logout]);
}
