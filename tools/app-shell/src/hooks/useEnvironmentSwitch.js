import { useCallback, useEffect, useState } from 'react';
import { fetchEnvironments, loginEnvironment } from '@etendosoftware/etendo-go-core/onboarding/api';
import { getApiBase } from './useNeoResource.js';

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

  useEffect(() => {
    if (!enabled) {
      setEnvironments([]);
      return;
    }
    const token = localStorage.getItem('sf_platform_token');
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const envs = await fetchEnvironments(fetch, getApiBase(), token);
        if (!cancelled) setEnvironments(Array.isArray(envs) ? envs : []);
      } catch {
        // A switcher that cannot list stays closed; the current company still shows.
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  const switchTo = useCallback(async (env) => {
    const token = localStorage.getItem('sf_platform_token');
    if (!token || !env?.adminUserId) return;
    setSwitching(env.clientId);
    try {
      const data = await loginEnvironment(fetch, getApiBase(), token, env);
      if (!data?.token) {
        setSwitching(null);
        return;
      }
      // ETP-4576 — loginEnvironment's fetch carries credentials: 'include', so
      // the server already set the __Host- session cookie for the new
      // environment by the time this resolves. There is no localStorage
      // handoff to build anymore; the hard navigation below boots cold and
      // AuthContext's restore effect hydrates from GET /sws/go/session, which
      // reads that cookie. The flag targeting identity belongs to the
      // account, not the tenant, so it survives — but anything cached per
      // tenant must not, hence the full load.
      window.location.href = '/';
    } catch {
      setSwitching(null);
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
    const token = localStorage.getItem('sf_platform_token');
    const wanted = String(clientName ?? '').trim().toLowerCase();
    if (!token || !wanted) return false;
    setSwitching(wanted);
    try {
      const envs = await fetchEnvironments(fetch, getApiBase(), token);
      const match = (Array.isArray(envs) ? envs : []).find(
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
  }, [switchTo]);

  const currentClientId = localStorage.getItem('sf_auth_client_id') || undefined;

  return { environments, switchTo, enterByClientName, switching, currentClientId };
}
