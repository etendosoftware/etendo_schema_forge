import { buildOnboardingReturnTo } from './oauthReturnTo.js';

/** Where an unauthenticated visitor is sent when no return trip is warranted. */
export const ONBOARDING_PATH = '/onboarding';

/**
 * Protected paths whose `returnTo` round-trip must survive the login detour.
 *
 * Only the OAuth consent handoff qualifies. A third-party client (opencode and the other MCP
 * clients) sends the user to `/authorize?client_id=...&state=...`; the grant can be completed
 * at that URL and nowhere else, so dropping its query would not relocate the landing page, it
 * would abort the authorization and leave the calling client without a token. See
 * `lib/__tests__/oauthReturnTo.test.js`, whose whole fixture set is `/authorize`.
 */
const RETURN_TO_ELIGIBLE_PREFIXES = ['/authorize'];

function isReturnToEligible(pathname) {
  return RETURN_TO_ELIGIBLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * ETP-5310 — Resolves the destination for an unauthenticated visit to a protected route.
 *
 * Logging in always lands on the home dashboard, never back on the window the user happened to
 * be looking at when the session ended. Previously EVERY protected path was encoded as a
 * `returnTo`, which had two visible consequences: after logging out the URL still named the last
 * window (`/onboarding?returnTo=/product`), and the next login bounced straight back into it —
 * so a user who signed back in under a role WITHOUT access to that window landed on the
 * "no access to this window" screen instead of home.
 *
 * `returnTo` was built for the OAuth consent handoff (the module is `oauthReturnTo.js`), not for
 * restoring the last window, so it is kept for exactly that and dropped everywhere else.
 *
 * @param {{pathname?: string, search?: string, hash?: string}|null|undefined} location
 * @returns {string} An internal path for `<Navigate to=...>`.
 */
export function resolveUnauthenticatedRedirect(location) {
  const pathname = location?.pathname || '/';
  return isReturnToEligible(pathname)
    ? buildOnboardingReturnTo(location)
    : ONBOARDING_PATH;
}
