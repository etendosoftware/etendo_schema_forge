import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { trackSessionStarted } from './health-events.js';

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
 */
export function useSessionStartTracking() {
  const { username, clientId } = useAuth();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void trackSessionStarted({ username, clientId });
  }, [username, clientId]);
}
