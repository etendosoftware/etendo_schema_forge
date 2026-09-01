import { useMemo } from 'react';
import {
  createApiFetch, getSessionCsrfToken, useAuthOptional,
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
  // ETP-4576 — the CSRF proof, never the credential. createApiFetch puts this argument into
  // `X-Go-CSRF` on unsafe methods: handing it `auth.token` (or the ambient bearer) sent the
  // credential out in the proof's header under the bearer scheme, and under the cookie one
  // put a value that is not the proof where the backend expects it — a 403 on every write.
  const csrfToken = auth?.csrfToken ?? null;
  const logout = useLogout();
  // Depend on WHETHER there is a session, never on the context object's identity: a provider
  // (or a test double) that hands back a fresh object each render would otherwise produce a
  // fresh request function each render, and any effect that lists it as a dependency would
  // re-fire forever.
  const hasSession = auth != null;

  // Falls back to the published store rather than trusting the context alone: a provider
  // that holds no `csrfToken` (it is populated by the session restore, and a host can mount
  // one before that settles) would otherwise hand back null and send an unsafe request with
  // no proof at all — a 403 on the write while every read still succeeds. The context value
  // still wins when it has one, so a fresher provider value is not lost.
  return useMemo(() => createApiFetch(
    baseUrl,
    hasSession ? () => csrfToken ?? getSessionCsrfToken() : getSessionCsrfToken,
    logout,
  ), [baseUrl, hasSession, csrfToken, logout]);
}
