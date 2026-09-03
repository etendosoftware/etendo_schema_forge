/**
 * Platform-account authentication methods (ETP-5115).
 *
 * Reading them needs nothing new: `fetchAccount` (GET /sws/go/me) already returns the account, and
 * the server now includes an `authMethods` object in it. Only the removal call lives here.
 *
 * It follows the shape of `@etendosoftware/etendo-go-core/onboarding/api` — an injected `fetchImpl`,
 * an explicit base URL and the platform token — so that when the core package next ships it can move
 * there beside its siblings without any caller changing. It is here rather than there only because
 * the core repo is a separate change.
 */

import { buildAuthHeaders, AUTH_ERROR_UI_KEYS } from '@etendosoftware/etendo-go-core/onboarding/api';

const PLATFORM_TOKEN_KEY = 'sf_platform_token';

/**
 * Codes the removal endpoint answers with, mapped to UI dictionary keys.
 *
 * The core package's own `AUTH_ERROR_UI_KEYS` cannot carry these: the endpoint is ours, and adding
 * to that table means a PR in the core repo. Callers should consult this map first and fall back to
 * the core one, which is what `resolveAuthMethodErrorKey` does.
 */
export const AUTH_METHOD_ERROR_UI_KEYS = {
  LAST_AUTH_METHOD: 'accountMethodLastRemaining',
  AUTH_METHOD_NOT_FOUND: 'accountMethodNotFound',
  // The servlet reuses the change-password code when a password removal arrives without the
  // current password. The core table maps it to the change-password wording, which is wrong here —
  // it talks about changing a password, not removing one — so ours wins for this endpoint.
  CHANGE_PASSWORD_MISSING_CREDENTIALS: 'accountMethodCurrentPasswordRequired',
};

/**
 * Resolves an error code to a UI dictionary key, ours first, then the core table.
 *
 * Returns null for an unmapped code so the caller can fall back to the server's `userMessage` and
 * then to a generic sentence. A raw code is never a dictionary key — passing one to `ui()` yields
 * the code back, which is how English backend text used to reach users (ETP-5022).
 */
export function resolveAuthMethodErrorKey(code) {
  if (!code) return null;
  return AUTH_METHOD_ERROR_UI_KEYS[code] || AUTH_ERROR_UI_KEYS[code] || null;
}

/**
 * Reads the servlet's error envelope, which is NESTED: `{ error: { code, message, userMessage } }`
 * (`EtendoGoJwtServlet.writeError`). This used to read it flat and so lost both fields for every
 * failure — the 409 telling the user this is their only sign-in method arrived as the generic
 * "could not be removed". Mirrors the core package's own `buildApiError`, including the older
 * responses whose `error` is a bare code string.
 */
function buildRemovalError(payload) {
  const flatCode = typeof payload?.error === 'string' ? payload.error : null;
  const nested = flatCode ? null : payload?.error;
  const error = new Error(
    nested?.message || payload?.message || 'Could not remove the authentication method'
  );
  error.code = nested?.code || flatCode || null;
  error.userMessage = nested?.userMessage || nested?.message || payload?.message || null;
  return error;
}


/** Reads the platform token the account endpoints authenticate with. */
export function readPlatformToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage?.getItem(PLATFORM_TOKEN_KEY) || null;
}

/**
 * Stores a rotated platform token.
 *
 * Removing a method rotates the session server-side (`removeAuthMethod` generates a fresh token and
 * writes it through `updateSessionToken`), so the token the browser holds stops working the instant
 * the call succeeds. Dropping the new one leaves the user authenticated in appearance only: the
 * screen redraws correctly and the very next request answers 401. That is what happened before this
 * existed, and it is silent — there is no error at the moment of the act.
 *
 * This is deliberately NOT what a password change does: that one discards the token on purpose and
 * signs the user out, because the credential they authenticated with is the one that just changed.
 * Removing one of several methods leaves the others valid, so the session should survive.
 */
export function writePlatformToken(token) {
  if (typeof window === 'undefined' || !token) return;
  window.localStorage?.setItem(PLATFORM_TOKEN_KEY, token);
}

/**
 * Removes one sign-in method from the account.
 *
 * The server decides whether this is allowed. It re-reads the account's whole method set inside the
 * transaction, so a client must never gate the call on its own arithmetic — the `removable` list
 * from /me is for enabling a button, not for authorising the act.
 *
 * @param {Function} fetchImpl fetch implementation to use
 * @param {string} baseUrl API base URL
 * @param {string} token platform session token
 * @param {string} method `password`, or the provider id of an identity
 * @param {string} [currentPassword] required only when removing the password
 * @returns {Promise<object>} the response, including the rotated token and the updated authMethods
 */
export async function removeAuthMethod(fetchImpl, baseUrl, token, method, currentPassword) {
  const response = await fetchImpl(`${baseUrl}/sws/go/auth-methods/remove`, {
    method: 'POST',
    // buildAuthHeaders is the core package's own header policy. Spelling the header out here
    // would both duplicate that decision and trip the auth-header guardrail, which allows exactly
    // one module to define it.
    headers: { ...buildAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(
      currentPassword ? { method, currentPassword } : { method }
    ),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw buildRemovalError(payload);
  }
  return payload;
}
