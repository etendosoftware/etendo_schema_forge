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
  const logout = useLogout();

  return useMemo(() => createApiFetch(
    baseUrl,
    auth ? () => token : getAmbientToken,
    logout,
  ), [baseUrl, auth, token, logout]);
}
