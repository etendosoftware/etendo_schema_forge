import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { setContext } from '../observability.js';
import { trackSessionStarted } from './health-events.js';
import { resolveRoleGroups } from './roleGroups.js';
import { resolveIdentityContext, clearIdentityContext } from './identityContext.js';
import { useTenantTypeContext } from './useTenantTypeContext.js';

/** ETP-6072 — longest `session_started` waits for the environment list before going out anyway. */
export const SESSION_START_MAX_WAIT_MS = 5000;

/**
 * Fires `session_started` once per authenticated app-shell mount (ETP-4210).
 *
 * Previously this event only fired from the onboarding wizard's `onSessionStarted`
 * callback, so it captured a new tenant's very first moment but never a regular
 * login by an already-onboarded user — the Health Score's Login dimension stayed
 * at 0 for ~98% of accounts. `AppLayout` only mounts once the user is authenticated
 * (see `useAccountIdentity` above), so a plain mount-only effect is enough: no need
 * to react to `authRevision`, which also bumps on role/org switches, or to `token`,
 * which changes on every silent JWT refresh — either would over-fire relative to
 * "the user opened the app this session".
 *
 * ETP-6043 — it also keeps `role_groups` in the common event context, following the
 * active role. That effect is declared first on purpose: React runs a component's
 * effects in declaration order and `setContext` updates the context synchronously
 * before its first await, so `session_started` already carries the groups.
 *
 * ETP-6228 — it keeps `ad_user_id`, `ad_client_id` and `etgo_account_id` in the context the same
 * way: written together (a company switch replaces all three) and cleared on unmount. Session loss
 * with the shell still mounted clears them from `App.jsx` (`clearIdentityContext`).
 *
 * ETP-6072 — it also mounts `useTenantTypeContext` (`tenant_type`, demo/productive) and holds
 * `session_started` until the environment list has settled, so the event carries the tenant type
 * too: it is the denominator of the adoption KPIs, and without the property a KPI that leaves demo
 * tenants out would filter the numerator only. The wait is capped at SESSION_START_MAX_WAIT_MS so
 * a slow or stuck list never costs the Login dimension; the event then goes out without it.
 */
export function useSessionStartTracking() {
  const { username, clientId, selectedRole, userId, etgoAccountId: ownerAccountId } = useAuth();
  const fired = useRef(false);
  // Declared before the effects below: its context effect runs first, so the event carries the type.
  const { settled: tenantTypeSettled } = useTenantTypeContext();
  const [waitExpired, setWaitExpired] = useState(false);
  const roleGroups = resolveRoleGroups(selectedRole);
  // A silent refresh hands back an equal role in a new object; only a real change re-sets it.
  const roleGroupsKey = roleGroups?.join(',');

  useEffect(() => {
    void setContext({ role_groups: roleGroupsKey ? roleGroupsKey.split(',') : undefined }); // NOSONAR -- fire-and-forget, same as trackSessionStarted below.
    return () => {
      void setContext({ role_groups: undefined }); // NOSONAR -- a signed-out page must not keep the last role.
    };
  }, [roleGroupsKey]);

  const { ad_user_id: adUserId, ad_client_id: adClientId, etgo_account_id: etgoAccountId } =
    resolveIdentityContext({ userId, clientId, accountId: ownerAccountId });

  // One write for the three ids, so a company switch never leaves one from the previous tenant.
  useEffect(() => {
    void setContext({ ad_user_id: adUserId, ad_client_id: adClientId, etgo_account_id: etgoAccountId }); // NOSONAR -- fire-and-forget, same as above.
    return () => {
      void clearIdentityContext(); // NOSONAR -- a signed-out page must not keep the last identity.
    };
  }, [adUserId, adClientId, etgoAccountId]);

  useEffect(() => {
    const timer = setTimeout(() => setWaitExpired(true), SESSION_START_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fired.current || !(tenantTypeSettled || waitExpired)) return;
    fired.current = true;
    void trackSessionStarted({ username, clientId }); // NOSONAR -- intentional fire-and-forget, same pattern as health-events.js's void track()/group() calls.
  }, [username, clientId, tenantTypeSettled, waitExpired]);
}
