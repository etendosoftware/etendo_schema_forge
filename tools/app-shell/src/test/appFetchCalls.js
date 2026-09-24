/**
 * The requests a test's SUBJECT made, with the session machinery's own left out.
 *
 * ETP-5195 gave AuthProvider a silent refresh: a provider constructed with a token marks the
 * session as needing one (`needsRefresh: !!initialSession?.token` in the core's
 * sessionController) and POSTs `/sws/neo/refreshtoken` once on mount. That is right in the app
 * — it is what bounds how long a role change made elsewhere can ride out the JWT's lifetime —
 * but it lands in `fetch.mock.calls` BEFORE whatever the test rendered for. A case that seeds a
 * token and then reads `calls[0]` gets the refresh instead of its own request, and
 * `toHaveBeenCalledTimes(1)` counts two.
 *
 * Filtering by WHAT the call is, rather than skipping a fixed number of leading calls: an
 * offset re-breaks the day the session grows a second background request, and it reads as a
 * magic number to whoever hits it next.
 *
 * Use it wherever a test asserts on the calls a hook or component made. A case whose subject IS
 * the refresh should read `fetch.mock.calls` directly.
 */
const SESSION_REQUESTS = ['/refreshtoken'];

export function appFetchCalls(fetchMock = globalThis.fetch) {
  return fetchMock.mock.calls.filter(
    ([url]) => !SESSION_REQUESTS.some((path) => String(url).includes(path)),
  );
}
