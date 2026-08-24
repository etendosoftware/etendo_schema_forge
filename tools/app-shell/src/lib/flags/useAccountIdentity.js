import { useEffect } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { refreshAccountIdentity } from './bootstrap.js';

/**
 * Resolves the account identity flags are targeted on, once per signed-in session.
 *
 * Mount this inside the authenticated shell. Until it resolves, flags target the
 * environment's ERP admin username, which the backend never sees — so a rule
 * keyed on the account evaluates inconsistently between the two ends. The
 * evaluation-context change re-renders subscribed components, so a flag that
 * flips once the account arrives corrects itself without a reload.
 */
export function useAccountIdentity() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    // ETP-4576 — one credential, one attempt. This used to read
    // `sf_platform_token` from localStorage and retry with it when the
    // environment JWT was stale, because two separate tokens could be held at
    // once. A session carries exactly one credential, chosen by the active
    // scheme, so there is no second one to fall back to and nothing to compare.
    // Identity discovery only; each endpoint still enforces its own access.
    refreshAccountIdentity({ apiBase: getApiBase() });
  }, [isAuthenticated]);
}
