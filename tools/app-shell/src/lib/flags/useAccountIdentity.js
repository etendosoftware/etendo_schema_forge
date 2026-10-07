import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { setSessionIdentity } from '../sessionIdentity.js';
import { clearAccountIdentity, refreshAccountIdentity, waitForIdentityReset } from './bootstrap.js';

/**
 * Resolves the account identity flags are targeted on, once per signed-in session, and publishes
 * who is signed in for the plain modules that cannot call `useAuth()` (flag targeting, analytics).
 *
 * Mount this inside the authenticated shell. Until it resolves, flags target the environment's
 * ERP admin username, which the backend never sees — so a rule keyed on the account evaluates
 * inconsistently between the two ends. The evaluation-context change re-renders subscribed
 * components, so a flag that flips once the account arrives corrects itself without a reload.
 *
 * ETP-5455 — it used to run only when localStorage held `sf_platform_token`, which nothing writes
 * since the cookie session, so under the cookie scheme it never ran. It now runs for any signed-in
 * session: the cookie travels on its own, and a legacy bearer session passes its own token.
 */
export function useAccountIdentity() {
  const { token, isAuthenticated, username, clientId } = useAuth();
  const previousIdentity = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      previousIdentity.current = null;
      return () => { cancelled = true; };
    }

    const nextIdentity = { username, clientId };
    const previous = previousIdentity.current;
    previousIdentity.current = nextIdentity;
    const switched = previous && (previous.username !== username || previous.clientId !== clientId);

    void (async () => {
      // Clear the old account before starting the new lookup. If the request fails,
      // the previous tenant must never remain in ConfigCat, RUM, or Mixpanel context.
      if (switched) await clearAccountIdentity();
      else await waitForIdentityReset();
      if (cancelled) return;
      setSessionIdentity(nextIdentity);
      await refreshAccountIdentity({ token, apiBase: getApiBase() });
    })();

    return () => { cancelled = true; };
  }, [token, isAuthenticated, username, clientId]);
}
