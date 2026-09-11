import { useMemo } from 'react';
import {
  createApiFetch, getAmbientToken, useAuthOptional,
} from '@etendosoftware/app-shell-core/auth';
import { useLogout } from '@/auth/useLogout.js';

/**
 * The app's authenticated `fetch`: the core helper bound to this session, with the same
 * contract and the same extra options (`on401`, `credentials`, `baseUrl`, `token`).
 *
 * This wraps the core `useApiFetch` rather than re-exporting it for ONE reason: the 401
 * auto-logout must go through `useLogout`, the app's clear-then-logout choke point, so an
 * expired session clears the persisted dashboard period filter exactly like every other
 * exit path does. Taking the core hook's own `useAuth().logout` would silently skip that
 * (ETP-4492's contract, re-established in ETP-5022 when the raw `fetch` call sites — which
 * used to call `logout()` themselves — were migrated here).
 *
 * Works without an `AuthProvider` above it, falling back to the ambient session; see the
 * core hook's doc comment for why that matters.
 *
 * @param {string} [baseUrl] prefix for relative paths; omit to use the base detected from
 *   the page location
 */
export function useApiFetch(baseUrl) {
  const auth = useAuthOptional();
  // ETP-4576 x ETP-5195 — this slot is the TOKEN getter, not the CSRF one. It used to be the
  // proof, and this wrapper kept passing the proof after the core moved the slot: the core then
  // read a csrfToken (null under bearer) as the session's bearer, found it different from the
  // live one the ambient session reports, and aborted EVERY request from this hook as belonging
  // to a superseded session. The proof is no longer injected at all — api.js reads it from
  // ./sessionCredentials.js, whose single writer is AuthProvider — so under the cookie scheme
  // this getter simply returns null and the `__Host-` session travels on its own.
  const token = auth?.token ?? null;
  const logout = useLogout();
  // Depend on WHETHER there is a session, never on the context object's identity: a provider
  // (or a test double) that hands back a fresh object each render would otherwise produce a
  // fresh request function each render, and any effect that lists it as a dependency would
  // re-fire forever.
  const hasSession = auth != null;
  // ETP-5195's session scope. Passing it is what lets a write that sat in the queue re-read the
  // bearer when it finally dispatches, instead of going out under the one its render saw.
  const scope = auth?.apiSessionScope;

  return useMemo(() => createApiFetch(
    baseUrl,
    scope ? () => scope.getSnapshot().session.token : hasSession ? () => token : getAmbientToken,
    logout,
    scope,
  ), [baseUrl, hasSession, token, logout, scope, auth?.authRevision]);
}
