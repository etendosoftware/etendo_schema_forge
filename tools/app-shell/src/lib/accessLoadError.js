/**
 * Access-load error store (ETP-5489).
 *
 * Set when a request that gates the layout — the role menu (`/sws/neo/listmenu`) or the caller's
 * report access (`/sws/neo/myreportaccess`) — is answered 401 while `GET /sws/go/session` says
 * the session is still alive. (`/sws/neo/windowaccessmap` passes `on401: 'ignore'`, so the core
 * never classifies its 401 and it folds into `null` as before; in practice the menu call, which
 * runs beside it, fails the same way.) In that case the core's `apiFetch` rejects with
 * `SessionAliveUnauthorizedError` and does NOT log the user out. Before, that 401 logged the user
 * out without revoking the cookie, and
 * `/onboarding` found the live session, re-entered and reloaded — a loop. Now `AppLayout` shows
 * `AccessLoadErrorScreen` (retry / log out) instead of an empty or unfiltered layout.
 *
 * A module-level store, like `environmentAccessGate`, so the plain-JS fetchers in `App.jsx` can
 * write it without a React tree. It is never cleared by a later success (the menu result is
 * cached, so a re-run would not even re-record it); `AppLayout` clears it when it unmounts, and
 * the screen's retry reloads the page.
 */
import { isSessionAliveUnauthorized } from '@etendosoftware/app-shell-core/auth/api';

let failed = false;
const listeners = new Set();

function set(next) {
  if (failed === next) return;
  failed = next;
  listeners.forEach((listener) => listener());
}

export function getAccessLoadError() {
  return failed;
}

export function subscribeAccessLoadError(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Records `error` when it is a 401 that did not end the session.
 *
 * @returns {boolean} whether the error was one, so a caller can tell it from a network failure
 */
export function recordAccessLoadError(error) {
  if (!isSessionAliveUnauthorized(error)) return false;
  set(true);
  return true;
}

export function clearAccessLoadError() {
  set(false);
}

/** Test seam: drops the recorded failure and every subscriber. */
export function resetAccessLoadErrorForTest() {
  failed = false;
  listeners.clear();
}
