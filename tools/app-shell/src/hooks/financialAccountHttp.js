/**
 * Shared fetch helpers for the `financial-account` NEO spec's hooks
 * (`useAccountMutations.js`, `useFinancialAccountAccounting.js`) — both call the
 * same endpoints and surface backend errors the same way, so the plumbing lives
 * here instead of being duplicated.
 *
 * ETP-4576 — requests authenticate with the `__Host-` session cookie, so no
 * header carries a credential. The header builders are split by method safety
 * because only unsafe methods need the CSRF proof: sending `X-Go-CSRF` on a GET
 * would be harmless but misleading, and omitting it on a write is a 403.
 * Callers must also pass `credentials: 'include'` on the fetch itself.
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

export async function readErrorMessage(res) {
  try {
    const json = await res.json();
    return json?.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function throwHttpError(res) {
  const message = await readErrorMessage(res);
  const error = new Error(message);
  error.status = res.status;
  throw error;
}
