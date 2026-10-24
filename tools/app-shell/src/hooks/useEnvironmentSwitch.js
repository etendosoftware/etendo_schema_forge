import { useCallback, useEffect, useRef, useState } from 'react';
import { createQueryKey, useOptionalDataCache } from '@etendosoftware/app-shell-core/data';
import { fetchEnvironments, loginEnvironment } from '@etendosoftware/etendo-go-core/onboarding/api';
import { rememberEnvironment } from '@etendosoftware/etendo-go-core/onboarding/state';
import { useAuthOptional } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource.js';
import { sortEnvironments } from '../lib/environmentPresentation.js';

export const ENVIRONMENT_LIST_REFRESH_EVENT = 'etendo:refresh-environments';

/** Query-key entity of the account's environment list in the app's shared DataProvider cache. */
const ENVIRONMENT_LIST_ENTITY = 'go-environments';

/**
 * ETP-5051 O-3 — the environment list, read through the app's shared query cache when there is
 * one. The hook is mounted by the banners, the side menu, the top bar, the tenant plan and the
 * layout at once, so a page load used to send ~6 identical `GET /sws/go/environments`, and since
 * ETP-5051 each of them runs the live quota counts of every listed tenant on the backend.
 * `cache.fetchQuery` gives every caller the same in-flight request and the same result for the
 * freshness window (the provider's record stale time), and `force` is the refresh event.
 *
 * Why the DataProvider cache rather than a module-level promise: it already owns the two hard
 * parts. It never stores a failed read, so a failure is retried by the next mount or refresh
 * instead of pinning an empty list; and it is cleared whenever the session identity
 * (csrf token, client, role, org) changes, and its keys carry that identity, so a list cannot
 * outlive a logout or leak into another account. A tenant switch is a hard navigation anyway
 * (`switchTo`), which drops the cache with the page.
 *
 * Without a DataProvider (InviteAcceptancePage in trees with no AuthProvider above it, isolated
 * unit tests) every caller reads the network directly, as before.
 *
 * Known limit: a refresh that fires while an earlier read is still in flight joins that read
 * rather than starting a new one — `fetchQuery` coalesces a forced read with a pending one. The
 * refresh is dispatched after a provisioning or an upgrade has completed, long after the
 * page-load read settled.
 */
function readEnvironmentList(dataCache, { force = false } = {}) {
  const apiBase = getApiBase();
  const fetcher = async () => sortEnvironments(await fetchEnvironments(fetch, apiBase));
  if (!dataCache?.cache || !dataCache.scope) return fetcher();
  return dataCache.cache.fetchQuery({
    key: environmentListKey(dataCache, apiBase),
    fetcher,
    force,
    staleTime: dataCache.recordStaleTime,
  });
}

function environmentListKey(dataCache, apiBase) {
  return createQueryKey({ ...dataCache.scope, apiBase, entity: ENVIRONMENT_LIST_ENTITY });
}

/** The cached list when it is still fresh, so a late mount starts with it instead of loading. */
function peekEnvironmentList(dataCache) {
  if (!dataCache?.cache || !dataCache.scope) return null;
  const key = environmentListKey(dataCache, getApiBase());
  return dataCache.cache.isFresh(key, dataCache.recordStaleTime) ? dataCache.cache.getData(key) : null;
}

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
export function useEnvironmentSwitch({
  enabled = true,
  credential = null,
  credentialScheme = null,
} = {}) {
  // `useAuthOptional`, not `useAuth`: ETP-5216 mounts InviteAcceptancePage in trees that have
  // no AuthProvider above them (accepting an invitation is something you do while signed out),
  // and the strict hook throws there. Reading the session optionally lands on exactly the state
  // the block comment above describes — not authenticated, so no environments and no switcher.
  const auth = useAuthOptional();
  // ETP-4576 — `credential` is the escape hatch for the caller the comment above names:
  // InviteAcceptancePage has no AuthProvider to read, so gating on the context alone left
  // `isAuthenticated` permanently false there and `enterByClientName` returned false before
  // issuing a single request. The invitee accepted, pressed "go to app", and nothing happened.
  // develop did not have this hole because its gate read `sf_platform_token` out of
  // localStorage, which works with no provider above; the cookie migration removed the key
  // AND the provider-free path in one step. The page already threads this same credential into
  // its accept call, so it is threaded here too rather than invented.
  //
  // Only the cookie scheme's value is a CSRF proof. Under `bearer` the credential belongs in
  // `Authorization`, and `buildAuthHeaders` puts whatever it is given into `X-Go-CSRF` — so a
  // bearer forwarded here would travel in the wrong slot and be refused.
  const threadedCsrf = credentialScheme === 'cookie' ? credential : null;
  const isAuthenticated = (auth?.isAuthenticated ?? false) || Boolean(credential);
  const csrfToken = auth?.csrfToken ?? threadedCsrf;
  const clientId = auth?.clientId ?? null;
  // ETP-5051 O-3 — read through a ref so the effect below keeps its [enabled, isAuthenticated]
  // identity: a session change clears the provider's cache and changes the key, and the next
  // read (refresh or a later mount) uses the new one.
  const dataCache = useOptionalDataCache();
  const dataCacheRef = useRef(dataCache);
  dataCacheRef.current = dataCache;
  const initialList = useState(() => (enabled && isAuthenticated ? peekEnvironmentList(dataCache) : null))[0];
  const [environments, setEnvironments] = useState(initialList ?? []);
  const [switching, setSwitching] = useState(null);
  // ETP-5190 — additive. `environments` alone cannot tell "still fetching" from "cannot know"
  // (both are the empty array), and a caller that derives the tenant plan from this list needs
  // that difference: rendering a plan-dependent view against a list that has not arrived yet
  // shows the wrong one and then swaps it under the user. Ends up false in EVERY exit path,
  // including no token and a thrown request. Starts false when a fresh shared list is already
  // in the cache (ETP-5051 O-3): there is nothing to wait for.
  const [loading, setLoading] = useState(enabled && !initialList);

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
    // Review MINOR-1 — when the session identity changes while the shared read is in flight (a
    // role or org switch, an `authRevision` bump), the DataProvider clears the cache and core's
    // `fetchQuery` rejects that read with an `AbortError` (a DOMException) once it settles. That is
    // not a failure of the list: re-read ONCE through the provider's current cache and key. Every
    // instance that shared the aborted read retries at the same moment, so they share the retry too
    // (or are handed a list a refresh already stored under the new key). Only once: a second abort
    // falls through to the catch below, so a run of identity changes cannot loop.
    const readSurvivingIdentityChange = async ({ force }) => {
      try {
        return await readEnvironmentList(dataCacheRef.current, { force });
      } catch (err) {
        if (cancelled || err?.name !== 'AbortError' || !dataCacheRef.current?.cache) throw err;
        return readEnvironmentList(dataCacheRef.current);
      }
    };
    // Never rejects: the whole body is inside the try, and every failure lands in the catch below,
    // so callers can start it without handling the returned promise.
    const loadEnvironments = async ({ force = false } = {}) => {
      try {
        // A fresh shared list is applied without a loading flip (no flash on a late mount).
        const fresh = force ? null : peekEnvironmentList(dataCacheRef.current);
        if (fresh) {
          setEnvironments(fresh);
          return;
        }
        setLoading(true);
        const envs = await readSurvivingIdentityChange({ force });
        if (!cancelled) setEnvironments(envs);
      } catch {
        // A switcher that cannot list stays closed; the current company still shows.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    // Every mounted instance listens and forces: the first forced read starts the request and the
    // others join it, so one refresh is one request and every instance receives the new list.
    const refreshEnvironments = () => loadEnvironments({ force: true });
    loadEnvironments();
    window.addEventListener(ENVIRONMENT_LIST_REFRESH_EVENT, refreshEnvironments);
    return () => {
      cancelled = true;
      window.removeEventListener(ENVIRONMENT_LIST_REFRESH_EVENT, refreshEnvironments);
    };
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
