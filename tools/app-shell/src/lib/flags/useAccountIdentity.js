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
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    void refreshAccountIdentity({ token, apiBase: getApiBase() });
  }, [token]);
}
