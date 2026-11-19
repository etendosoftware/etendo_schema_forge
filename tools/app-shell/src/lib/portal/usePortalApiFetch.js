import { useMemo } from 'react';
import { createApiFetch } from '@etendosoftware/app-shell-core/auth';

/** The portal holds no session credential of its own: its token rides `X-Portal-Token`. */
const NO_SESSION_TOKEN = () => null;

/**
 * The customer portal's request client: the shared helper (same headers, base URL, timeout and
 * `NetworkError` contract as `useApiFetch`), but OUTSIDE the app's session scope.
 *
 * Why not `useApiFetch`. That client is bound to the app's session identity: it captures the
 * identity when a request leaves and, if the identity changed by the time the answer arrives,
 * throws "The request belongs to a superseded session" and discards the answer
 * (`createApiFetch`'s `isOurs()` check, app-shell-core `auth/api.js`). A customer opening a portal
 * link from an email has no app session, so the app's auth bootstrap resolves the identity
 * (unknown, then anonymous) WHILE the portal's first requests are in flight. The backend answered
 * 200 and had committed the decision, and the page still showed "No pudimos aplicar tu decisión";
 * a retry, sent after the bootstrap settled, then read "Ya habías respondido" (ETP-6209, live in
 * production; never on localhost, where the browser already holds a session).
 *
 * The portal belongs to no session by design — the link token is its whole credential — so it has
 * no identity to lose. Passing `null` as the scope opts out of the ambient session entirely, the
 * same way the support handoff does (`lib/supportSession.js`). Two more consequences, both wanted:
 * there is no logout handler, so a portal 401 can never log anybody out (every call also sends
 * `on401: 'ignore'`), and nothing here touches the app's data cache or write announcements, which
 * only ever concern `/sws/neo` records.
 *
 * @param {string} [baseUrl] prefix for relative paths (see `resolvePortalBaseUrl`)
 */
export function usePortalApiFetch(baseUrl) {
  return useMemo(() => createApiFetch(baseUrl, NO_SESSION_TOKEN, null, null), [baseUrl]);
}
