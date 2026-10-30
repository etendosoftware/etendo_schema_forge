import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { setContext } from '../observability.js';
import { trackSessionStarted } from './health-events.js';
import { resolveRoleGroups } from './roleGroups.js';

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
 */
export function useSessionStartTracking() {
  const { username, clientId, selectedRole } = useAuth();
  const fired = useRef(false);
  const roleGroups = resolveRoleGroups(selectedRole);
  // A silent refresh hands back an equal role in a new object; only a real change re-sets it.
  const roleGroupsKey = roleGroups?.join(',');

  useEffect(() => {
    void setContext({ role_groups: roleGroupsKey ? roleGroupsKey.split(',') : undefined }); // NOSONAR -- fire-and-forget, same as trackSessionStarted below.
    return () => {
      void setContext({ role_groups: undefined }); // NOSONAR -- a signed-out page must not keep the last role.
    };
  }, [roleGroupsKey]);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void trackSessionStarted({ username, clientId }); // NOSONAR -- intentional fire-and-forget, same pattern as health-events.js's void track()/group() calls.
  }, [username, clientId]);
}
