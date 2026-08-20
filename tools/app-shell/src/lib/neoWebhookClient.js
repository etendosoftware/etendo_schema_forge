/**
 * Shared plumbing for the NEO pseudo-spec bridge webhook family (`NeoGoWebhookBridge`
 * in `com.etendoerp.go`) — `rolesApi.js` (`SFRolesOverview`/`SFSystemRoleTemplates`)
 * and `userRoleAssignmentsApi.js` (`SFUserRoleAssignments`/`SFAssignUserRoles`) each
 * call these directly instead of redefining them (ETP-4906 — extracted to fix a
 * SonarQube new-code duplication gate failure across those two files).
 *
 * This module owns only the MECHANICAL fetch/parse/unwrap logic that every one of
 * these webhooks shares — same-origin base URL, credential lookup, and the
 * `{result: "<json-string>"}` / `{error: "<message>"}` response envelope. It does
 * NOT own any domain-specific behavior (auth semantics, "deny silently" shapes,
 * etc.) — that documentation stays in each caller's own file, next to the function
 * that actually implements it.
 */
import { jsonHeaders } from './sessionHeaders.js';


/**
 * Detects the app's own base path so NEO webhook URLs stay same-origin in every
 * deployment: strips everything from `/web/` onward when the SPA is served under
 * that segment, otherwise falls back to `VITE_API_BASE` (or empty, same-origin).
 */
function detectBase() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  return webIdx !== -1 ? path.substring(0, webIdx) : (import.meta.env.VITE_API_BASE || '');
}

/** Base URL for every NEO Headless pseudo-spec webhook endpoint. */
export const NEO_BASE = `${detectBase()}/sws/neo`;

/**
 * The credential header for these webhooks, WITHOUT a `Content-Type`.
 *
 * ETP-4576 — this used to read `sf_auth_token` out of `localStorage` on every
 * call. That key is deleted by `purgeLegacyAuthStorage()`, so it had become an
 * unconditional null and every webhook in this family went out unauthenticated.
 * `SFSystemRoleTemplates` then answered with its documented "denied" shape
 * (`{roles: []}`), which callers correctly render as an empty state rather than
 * an error — so the role controls came up blank with nothing logged anywhere.
 *
 * The Content-Type is stripped on purpose, preserving this module's existing
 * convention: these are GETs with no body, and `application/json` is not a
 * CORS-safelisted value, so sending it would trigger a preflight OPTIONS on
 * every call whenever `VITE_API_BASE` points at another origin. `jsonHeaders()`
 * always sets it, so the credential is taken and the rest dropped.
 *
 * Still read at request time, never cached at module scope — a login, a logout
 * or a preference flip takes effect without a reload, which is exactly what the
 * fresh localStorage read used to guarantee. The backend still decides
 * admin/client-admin access (`NeoAccessHelper.isAdminOrClientAdmin`) from the
 * caller's own role, whichever scheme carried the session here.
 */
export function credentialHeaders() {
  const { 'Content-Type': _contentType, ...credential } = jsonHeaders();
  return credential;
}

/**
 * Shared GET + response-unwrap mechanics for the NEO pseudo-spec bridge webhook
 * family. Same fetch conventions across every caller: no `Content-Type` header
 * (a GET with no body — `application/json` isn't a CORS-safelisted value, so
 * setting it unnecessarily triggers a preflight OPTIONS request, and risks it
 * failing, whenever `VITE_API_BASE` points at a different origin than the SPA),
 * and the credential taken from the active session scheme via
 * `credentialHeaders()` on every call.
 *
 * Unwrap order:
 * 1. Non-ok HTTP status → throws `data.error` / `data.message` / a generic
 *    `${webhookName} error: <status>` message.
 * 2. A 200 with a non-JSON body (e.g. a SPA-fallback index.html served when this
 *    endpoint isn't actually backed — no dev proxy, no backend, as in most E2E
 *    test environments) → throws, rather than silently resolving to an
 *    empty-but-valid shape.
 * 3. An explicit `data.error` key on an otherwise-ok response → throws it. (
 *    `NeoGoWebhookBridge` maps a genuinely unexpected `RuntimeException` to
 *    `responseVars["error"]` — usually HTTP 500, caught by step 1, but a
 *    same-request "error" key can also arrive on a 200 in edge cases, so this is
 *    checked defensively either way.)
 * 4. `data.result` as a JSON string → parsed and returned; throws if it fails to
 *    parse.
 * 5. `data.result` as a plain object (not an array) → returned as-is.
 * 6. Otherwise, `resolveFallback(data)` is called for the caller's own
 *    domain-specific shape check — it must return the value to resolve with, or
 *    a nullish value if `data` doesn't match, in which case this function throws
 *    the same `${webhookName} returned an unexpected shape` error every caller
 *    shares today.
 *
 * @param {string} url - the full NEO endpoint URL (query string already appended
 *   by the caller, base URL from `NEO_BASE`).
 * @param {string} webhookName - the backend webhook class name, used only for
 *   error messages (e.g. `'SFRolesOverview'`).
 * @param {(data: object) => (object|null|undefined)} resolveFallback - the
 *   caller's own final shape check, tried only after the shared `result`
 *   handling above finds no match.
 * @returns {Promise<object>} the unwrapped payload.
 */
export async function fetchNeoWebhookJson(url, webhookName, resolveFallback) {
  // `credentials: 'include'` is what lets the `__Host-` session cookie reach a
  // cross-origin backend; same-origin sends it either way.
  const res = await fetch(url, { headers: credentialHeaders(), credentials: 'include' });
  const text = await res.text();
  let data;
  let parsed = true;
  try { data = JSON.parse(text); } catch { data = text; parsed = false; }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `${webhookName} error: ${res.status}`);
  }
  if (!parsed || typeof data !== 'object' || data === null) {
    throw new Error(`${webhookName} returned a non-JSON response`);
  }
  if (data.error) {
    throw new Error(data.error);
  }
  if (typeof data.result === 'string') {
    try {
      return JSON.parse(data.result);
    } catch {
      throw new Error(`${webhookName} returned an invalid result payload`);
    }
  }
  if (data.result && typeof data.result === 'object' && !Array.isArray(data.result)) {
    return data.result;
  }
  const fallback = resolveFallback(data);
  if (fallback != null) {
    return fallback;
  }
  throw new Error(`${webhookName} returned an unexpected shape`);
}
