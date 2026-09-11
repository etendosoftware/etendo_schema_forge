import { useCallback, useEffect, useState } from 'react';
import { fetchEnvironments, loginEnvironment } from '@etendosoftware/etendo-go-core/onboarding/api';
import { rememberEnvironment } from '@etendosoftware/etendo-go-core/onboarding/state';
import { useAuthOptional } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource.js';
import { sortEnvironments } from '../lib/environmentPresentation.js';

/**
 * Lists the environments the signed-in account owns and switches between them.
 *
 * Switching tenants is a re-login, not a context change: each environment has
 * its own admin user, so the backend rotates the session for it. That is why
 * this returns a hard navigation rather than updating state — every cache keyed
 * on the old tenant has to go.
 *
 * ETP-4576 — the account is proven by the `__Host-` session cookie, not by a
 * token this hook can read, so `isAuthenticated` is the gate: a session that
 * never went through the account login leaves `environments` empty, and callers
 * should keep showing the current company alone rather than an empty switcher.
 * Entering an environment is an unsafe method and carries the CSRF proof;
 * listing them is a GET and carries none.
 */
export function useEnvironmentSwitch({ enabled = true } = {}) {
  // `useAuthOptional`, not `useAuth`: ETP-5216 mounts InviteAcceptancePage in trees that have
  // no AuthProvider above them (accepting an invitation is something you do while signed out),
  // and the strict hook throws there. Reading the session optionally lands on exactly the state
  // the block comment above describes — not authenticated, so no environments and no switcher.
  const auth = useAuthOptional();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const csrfToken = auth?.csrfToken ?? null;
  const clientId = auth?.clientId ?? null;
  const [environments, setEnvironments] = useState([]);
  const [switching, setSwitching] = useState(null);
  // ETP-5190 — additive. `environments` alone cannot tell "still fetching" from "cannot know"
  // (both are the empty array), and a caller that derives the tenant plan from this list needs
  // that difference: rendering a plan-dependent view against a list that has not arrived yet
  // shows the wrong one and then swaps it under the user. Ends up false in EVERY exit path,
  // including no token and a thrown request.
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      setEnvironments([]);
      setLoading(false);
      return;
    }
    // ETP-4576 — environment discovery is account-scoped, and the account session
    // is the `__Host-` cookie: there is no client-held token to read or to gate on.
    // develop's version reads sf_platform_token/sf_auth_token from localStorage, keys
    // the cookie migration stopped writing, so that gate would never pass and the
    // environment list would come back empty for every authenticated user.
    // `isAuthenticated` above is the gate; `sortEnvironments` is kept.
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const envs = await fetchEnvironments(fetch, getApiBase());
        if (!cancelled) setEnvironments(sortEnvironments(envs));
      } catch {
        // A switcher that cannot list stays closed; the current company still shows.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, isAuthenticated]);

  const switchTo = useCallback(async (env) => {
    if (!isAuthenticated || !env?.adminUserId) return false;
    setSwitching(env.clientId);
    try {
      // The backend rotates the session cookie for the target environment and
      // answers `{ status: 'success' }` — there is no token to store client-side.
      const data = await loginEnvironment(fetch, getApiBase(), csrfToken, env);
      if (data?.status !== 'success') {
        setSwitching(null);
        return false;
      }
      // ETP-5202 — refuse to enter an environment the user has no role in. `GET /sws/go/login`
      // does NOT fail in that case: it calls generateToken(user, null) and answers 200 with an
      // empty roleList, so entering would write a session with no role and drop the user into an
      // empty app. The invited-user path makes this reachable — an admin-created user has zero
      // roles until somebody assigns one (ETP-4830).
      //
      // Only an explicitly EMPTY array blocks: a missing roleList is left to the existing
      // behaviour, since `buildEnvironmentSessionStorage` already treats it as optional and an
      // older backend must not be locked out.
      if (Array.isArray(data.roleList) && data.roleList.length === 0) {
        setSwitching(null);
        return false;
      }
      // Remembering the environment is a UX preference, deliberately outside the
      // session: logging out must not forget the last tenant entered.
      rememberEnvironment(env.clientId);
      // The flag targeting identity belongs to the account, not the tenant, so it
      // survives — but anything cached per tenant must not, hence the full load.
      window.location.href = '/';
      return true;
    } catch {
      setSwitching(null);
      return false;
    }
  }, [isAuthenticated, csrfToken]);

  /**
   * Enters an environment identified by name, re-reading the list first.
   *
   * For an environment that was just provisioned: it cannot be in the list this
   * hook loaded on mount, so a stale lookup would silently fail and leave the
   * caller with nothing to enter. Returns false when the name cannot be found,
   * so the caller can keep offering its own fallback rather than appear to hang.
   */
  const enterByClientName = useCallback(async (clientName) => {
    const wanted = String(clientName ?? '').trim().toLowerCase();
    if (!isAuthenticated || !wanted) return false;
    setSwitching(wanted);
    try {
      const envs = await fetchEnvironments(fetch, getApiBase());
      const match = sortEnvironments(envs).find(
        (env) => String(env?.clientName ?? '').trim().toLowerCase() === wanted
      );
      if (!match) {
        setSwitching(null);
        return false;
      }
      return await switchTo(match);
    } catch {
      setSwitching(null);
      return false;
    }
  }, [isAuthenticated, switchTo]);

  return {
    environments,
    loading,
    switchTo,
    enterByClientName,
    switching,
    // ETP-4576 — from the session, not from sf_auth_client_id: the cookie migration
    // stopped writing that key.
    currentClientId: clientId || undefined,
  };
}
