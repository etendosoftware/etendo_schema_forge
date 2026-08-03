/**
 * Request headers for the cookie-session contract (ETP-4576).
 *
 * The session lives in the `__Host-go_session` cookie, so no header carries a
 * credential — callers pass `credentials: 'include'` on the fetch itself and the
 * browser attaches it. The two builders are split by method safety because only
 * unsafe methods need the CSRF proof: sending `X-Go-CSRF` on a GET would be
 * harmless but misleading, and omitting it on a write is a 403.
 *
 * Single definition for the whole app. `hooks/financialAccountHttp.js`
 * re-exports these rather than keeping its own copy.
 */

/** Headers for safe methods (GET). No credential, no CSRF proof. */
export function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

/**
 * Headers for unsafe methods (POST/PUT/PATCH/DELETE). Adds the CSRF proof when
 * a session provides one; omits the header entirely when it does not, rather
 * than sending an empty value the backend would reject as malformed.
 */
export function writeHeaders(csrfToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-Go-CSRF'] = csrfToken;
  return headers;
}
