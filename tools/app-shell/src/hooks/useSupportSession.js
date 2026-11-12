import { useSyncExternalStore } from 'react';
import { getSupportSessionState, subscribeSupportSession } from '@/lib/supportSession.js';

/**
 * ETP-5351 — whether this tab is in a support session, and which one.
 *
 * `supportSession` is `{clientId, clientName, expiresAt}` once `/me` has answered. Right after the
 * handoff it can be `null` while `isSupportMode` is already true: the store is seeded from the
 * marker the handoff wrote, before `/me` has been read (see lib/supportSession.js).
 */
export function useSupportSession() {
  const current = useSyncExternalStore(
    subscribeSupportSession,
    getSupportSessionState,
    getSupportSessionState,
  );
  return {
    isSupportMode: current.status === 'support',
    supportSession: current.session,
  };
}
