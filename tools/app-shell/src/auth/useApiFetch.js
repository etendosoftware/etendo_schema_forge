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
  const token = auth?.token ?? null;
  // ETP-5195 — no `?? null` here: `createApiFetch`'s 4th arg distinguishes `null` ("opt out
  // of ambient inheritance entirely") from `undefined` ("inherit whatever scope is
  // registered ambiently"). When there's no local session (`auth` is null, e.g. this hook is
  // called outside any AuthProvider), we still want to inherit the app's ambient session's
  // scope if one is registered elsewhere — matching the core hook's own contract — not force
  // an opt-out that would silently disable the stale-request guard for that call site.
  const apiSessionScope = auth?.apiSessionScope;
  const logout = useLogout();
  // Depend on WHETHER there is a session, never on the context object's identity: a provider
  // (or a test double) that hands back a fresh object each render would otherwise produce a
  // fresh request function each render, and any effect that lists it as a dependency would
  // re-fire forever.
  const hasSession = auth != null;

  // [ETP-5195 follow-up] When a scope (the session controller) is available, read the token
  // LIVE off it at request time instead of closing over the `token` const captured by THIS
  // render — matches the core `useApiFetch`'s own pattern. This is what lets `token` be
  // dropped from the dependency array below: the returned function's identity no longer needs
  // to change on every token rotation (the backend mints a fresh JWT on every silent refresh,
  // even with zero role/org change) for it to still send the freshest token on every call.
  // Before this, every `useApiFetch`-based hook's own data-fetch effect (keyed on this
  // function's identity) refired on every tab-focus silent refresh — confirmed live via
  // Network tab showing unrelated windows (their record data, images, related lookups) all
  // refetch together on a plain alt-tab with no role change.
  let getToken;
  if (apiSessionScope) {
    getToken = () => apiSessionScope.getSnapshot().session.token;
  } else if (hasSession) {
    getToken = () => token;
  } else {
    getToken = getAmbientToken;
  }

  return useMemo(() => createApiFetch(
    baseUrl,
    getToken,
    logout,
    apiSessionScope,
  ), [baseUrl, hasSession, logout, apiSessionScope]);
}
