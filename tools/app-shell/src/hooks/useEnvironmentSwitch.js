import { useCallback, useEffect, useState } from 'react';
import { fetchEnvironments, loginEnvironment } from '@etendosoftware/etendo-go-core/onboarding/api';
import { buildEnvironmentSessionStorage } from '@etendosoftware/etendo-go-core/onboarding/state';
import { getApiBase } from './useNeoResource.js';
import { sortEnvironments } from '../lib/environmentPresentation.js';

/**
 * Lists the environments the signed-in account owns and switches between them.
 *
 * Switching tenants is a re-login, not a context change: each environment has
 * its own admin user, so it needs its own JWT. That is why this returns a hard
 * navigation rather than updating state — every cache keyed on the old tenant
 * has to go.
 *
 * Requires the platform token, which is what proves the account owns the
 * environments. Sessions that never went through the account login do not have
 * it, so `environments` stays empty and callers should keep showing the current
 * company alone rather than an empty switcher.
 */
export function useEnvironmentSwitch({ enabled = true } = {}) {
  const [environments, setEnvironments] = useState([]);
  const [switching, setSwitching] = useState(null);
  // ETP-5190 — additive. `environments` alone cannot tell "still fetching" from "cannot know"
  // (both are the empty array), and a caller that derives the tenant plan from this list needs
  // that difference: rendering a plan-dependent view against a list that has not arrived yet
  // shows the wrong one and then swaps it under the user. Ends up false in EVERY exit path,
  // including no token and a thrown request.
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setEnvironments([]);
      setLoading(false);
      return;
    }
    // Environment discovery is account-scoped. Prefer the platform session because the active
    // tenant JWT may be expired while the account session remains valid after a credential change.
    const token = localStorage.getItem('sf_platform_token') || localStorage.getItem('sf_auth_token');
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const envs = await fetchEnvironments(fetch, getApiBase(), token);
        if (!cancelled) setEnvironments(sortEnvironments(envs));
      } catch {
        // A switcher that cannot list stays closed; the current company still shows.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  const switchTo = useCallback(async (env) => {
    const token = localStorage.getItem('sf_platform_token') || localStorage.getItem('sf_auth_token');
    if (!token || !env?.adminUserId) return false;
    setSwitching(env.clientId);
    try {
      const data = await loginEnvironment(fetch, getApiBase(), token, env);
      if (!data?.token) {
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
      Object.entries(buildEnvironmentSessionStorage(env, data)).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
      // The flag targeting identity belongs to the account, not the tenant, so it
      // survives — but anything cached per tenant must not, hence the full load.
      window.location.href = '/';
      return true;
    } catch {
      setSwitching(null);
      return false;
    }
  }, []);

  /**
   * Enters an environment identified by name, re-reading the list first.
   *
   * For an environment that was just provisioned: it cannot be in the list this
   * hook loaded on mount, so a stale lookup would silently fail and leave the
   * caller with nothing to enter. Returns false when the name cannot be found,
   * so the caller can keep offering its own fallback rather than appear to hang.
   */
  const enterByClientName = useCallback(async (clientName) => {
    const token = localStorage.getItem('sf_platform_token') || localStorage.getItem('sf_auth_token');
    const wanted = String(clientName ?? '').trim().toLowerCase();
    if (!token || !wanted) return false;
    setSwitching(wanted);
    try {
      const envs = await fetchEnvironments(fetch, getApiBase(), token);
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
  }, [switchTo]);

  const currentClientId = localStorage.getItem('sf_auth_client_id') || undefined;

  return { environments, loading, switchTo, enterByClientName, switching, currentClientId };
}
