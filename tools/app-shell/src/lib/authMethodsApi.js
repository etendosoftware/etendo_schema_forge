/**
 * Platform-account authentication methods (ETP-5115).
 *
 * Reading them needs nothing new: `fetchAccount` (GET /sws/go/me) already returns the account, and
 * the server now includes an `authMethods` object in it. Only the removal call lives here.
 *
 * ETP-4576 — the removal goes through `apiFetch`, not an injected `fetchImpl` plus a hand-built
 * header bag. It used to mirror the core package's `(fetchImpl, baseUrl, token)` shape so it could
 * move there unchanged, and that shape is exactly what broke it: the "token" was fed to
 * `buildAuthHeaders`, which puts whatever it receives into `X-Go-CSRF`. Under the cookie session
 * `sf_platform_token` is purged, so the argument was null, the POST went out with no proof of
 * intent, and removing a sign-in method was refused — while the GET that renders the same screen
 * kept working, because the browser attaches the session cookie on its own and reads need no proof.
 * `apiFetch` decides the credential from the active scheme, so there is nothing left here to get
 * wrong.
 *
 * The core subpath, never the `@/auth/api.js` barrel: the barrel re-exports `.jsx` and this module
 * is imported by plain `node --test` suites (see docs/request-policy.md).
 */

import { AUTH_ERROR_UI_KEYS } from '@etendosoftware/etendo-go-core/onboarding/api';
import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';

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


/**
 * Removes one sign-in method from the account.
 *
 * The server decides whether this is allowed. It re-reads the account's whole method set inside the
 * transaction, so a client must never gate the call on its own arithmetic — the `removable` list
 * from /me is for enabling a button, not for authorising the act.
 *
 * ETP-4576 — the removal rotates the session SERVER-SIDE, and under the cookie scheme the rotated
 * session arrives as a `Set-Cookie` the browser installs on its own. Nothing is persisted here and
 * nothing needs to be: the previous code stored the rotated token out of the body into
 * `sf_platform_token`, a key `purgeLegacyAuthStorage` deletes, so it was writing a credential into
 * storage that the migration exists to empty.
 *
 * @param {string} method `password`, or the provider id of an identity
 * @param {string} [currentPassword] required only when removing the password
 * @param {string} [baseUrl] API base URL; defaults to the ambient session's
 * @returns {Promise<object>} the response, including the updated authMethods
 */
export async function removeAuthMethod(method, currentPassword, baseUrl) {
  const response = await apiFetch('/sws/go/auth-methods/remove', {
    method: 'POST',
    ...(baseUrl !== undefined ? { baseUrl } : {}),
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
