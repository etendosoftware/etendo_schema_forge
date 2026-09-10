import { useCallback, useEffect, useState } from 'react';
import { fetchEnvironments, loginEnvironment } from '@etendosoftware/etendo-go-core/onboarding/api';
import { rememberEnvironment } from '@etendosoftware/etendo-go-core/onboarding/state';
import { useAuth } from '@/auth/AuthContext.jsx';
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
  const { isAuthenticated, csrfToken, clientId } = useAuth();
  const [environments, setEnvironments] = useState([]);
  const [switching, setSwitching] = useState(null);

  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      setEnvironments([]);
      return;
    }
    // ETP-4576 — environment discovery is account-scoped, and the account session
    // is the `__Host-` cookie: there is no client-held token to read or to gate on.
    // The epic's version read sf_platform_token/sf_auth_token from localStorage,
    // keys the cookie migration stopped writing, so that gate would never pass.
    // `sortEnvironments` is the epic's own presentation change and is kept.
    let cancelled = false;
    (async () => {
      try {
        const envs = await fetchEnvironments(fetch, getApiBase());
        if (!cancelled) setEnvironments(sortEnvironments(envs));
      } catch {
        // A switcher that cannot list stays closed; the current company still shows.
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, isAuthenticated]);

  const switchTo = useCallback(async (env) => {
    if (!isAuthenticated || !env?.adminUserId) return;
    setSwitching(env.clientId);
    try {
      // The backend rotates the session cookie for the target environment and
      // answers `{ status: 'success' }` — there is no token to store client-side.
      const data = await loginEnvironment(fetch, getApiBase(), csrfToken, env);
      if (data?.status !== 'success') {
        setSwitching(null);
        return;
      }
      // Remembering the environment is a UX preference, deliberately outside the
      // session: logging out must not forget the last tenant entered.
      rememberEnvironment(env.clientId);
      // The flag targeting identity belongs to the account, not the tenant, so it
      // survives — but anything cached per tenant must not, hence the full load.
      window.location.href = '/';
    } catch {
      setSwitching(null);
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
      await switchTo(match);
      return true;
    } catch {
      setSwitching(null);
      return false;
    }
  }, [isAuthenticated, switchTo]);

  return {
    environments,
    switchTo,
    enterByClientName,
    switching,
    currentClientId: clientId || undefined,
  };
}
