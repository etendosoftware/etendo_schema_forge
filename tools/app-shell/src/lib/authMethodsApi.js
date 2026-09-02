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

import { buildAuthHeaders } from '@etendosoftware/etendo-go-core/onboarding/api';

const PLATFORM_TOKEN_KEY = 'sf_platform_token';

/** Reads the platform token the account endpoints authenticate with. */
export function readPlatformToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage?.getItem(PLATFORM_TOKEN_KEY) || null;
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
    const error = new Error(payload?.message || 'Could not remove the authentication method');
    error.code = payload?.code || null;
    error.userMessage = payload?.userMessage || payload?.message || null;
    throw error;
  }
  return payload;
}
