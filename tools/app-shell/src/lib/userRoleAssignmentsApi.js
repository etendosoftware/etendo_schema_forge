function detectBase() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  return webIdx !== -1 ? path.substring(0, webIdx) : (import.meta.env.VITE_API_BASE || '');
}

const BASE = detectBase();
const NEO_BASE = `${BASE}/sws/neo`;

function getToken() {
  return localStorage.getItem('sf_auth_token');
}

/**
 * Shared GET + `{result: "<json-string>"}`-unwrap mechanics for the two webhooks below.
 * Same fetch conventions as `rolesApi.js`'s `fetchRolesOverview` / `menuTree.js`'s
 * `callMenuWebhook`: no `Content-Type` header (a GET with no body — `application/json`
 * isn't a CORS-safelisted value, so setting it unnecessarily triggers a preflight OPTIONS
 * request, and risks it failing, whenever `VITE_API_BASE` points at a different origin
 * than the SPA), `sf_auth_token` read fresh from `localStorage` on every call (not cached
 * at module scope — the token can change after login/logout without a page reload).
 *
 * @param {string} url - full NEO endpoint URL (query string already appended by the caller).
 * @param {string} webhookName - used only for error messages (e.g. "SFUserRoleAssignments").
 * @returns {Promise<object>} the unwrapped JSON payload (the parsed `result` string, or the
 *   raw body when the bridge already returned a plain object with no `result` wrapper).
 */
async function fetchNeoJson(url, webhookName) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  const text = await res.text();
  let data;
  let parsed = true;
  try { data = JSON.parse(text); } catch { data = text; parsed = false; }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `${webhookName} error: ${res.status}`);
  }
  // A 200 with a non-JSON body (e.g. a SPA-fallback index.html served when this endpoint
  // isn't actually backed — no dev proxy, no backend, as in most E2E test environments)
  // must be treated as a failure rather than silently resolving to an empty-but-valid shape.
  if (!parsed || typeof data !== 'object' || data === null) {
    throw new Error(`${webhookName} returned a non-JSON response`);
  }
  // NeoGoWebhookBridge maps a genuinely unexpected RuntimeException to responseVars["error"]
  // (HTTP 500 — !res.ok already caught it above in that case, but a same-request "error" key
  // can also arrive on a 200 in edge cases, so check it defensively either way).
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
  // Fallback: the bridge already handed back the unwrapped shape directly (mirrors
  // rolesApi.js's `Array.isArray(data.roles)` fallback for its own response shape).
  if ('assignments' in data || 'templateRoleIds' in data || 'success' in data) {
    return data;
  }
  throw new Error(`${webhookName} returned an unexpected shape`);
}

/**
 * Fetches applied template-role assignments from `GET /sws/neo/userroleassignments`
 * (ETP-4906 — `SFUserRoleAssignments.java`, the read-path companion to
 * `SFAssignUserRoles`). Two modes selected by whether `userId` is passed:
 *
 * - `fetchUserRoleAssignments()` — bulk mode, for the Users grid: every user of the
 *   caller's own client, mapped to their applied template role ids.
 *   `{"assignments": {"<userId>": ["<templateRoleId>", ...], ...}}`
 * - `fetchUserRoleAssignments(userId)` — single mode, for the user form on load: that
 *   one user's applied template role ids.
 *   `{"userId": "...", "templateRoleIds": ["...", "..."]}`
 *
 * Reached via NEO Headless's own JWT auth (the pseudo-spec bridge), not the Webhooks
 * module's `/webhooks/SFUserRoleAssignments` — same rationale as `fetchRolesOverview`
 * (see that function's docstring): the per-(webhook, role) grant row in
 * `SMFWHE_DEFINEDWEBHOOK_ROLE` is wiped back to its XML baseline by `update.database`,
 * while the NEO bridge only needs a valid `sf_auth_token`.
 *
 * Access is admin/client-admin gated server-side (`NeoAccessHelper.isAdminOrClientAdmin`).
 * A non-admin caller, or a client-admin targeting another tenant's user id, does NOT
 * error — it gets this webhook's own "deny silently" empty shape (`{assignments: {}}` in
 * bulk mode, `{userId, templateRoleIds: []}` in single mode; see `SFUserRoleAssignments`'s
 * class javadoc). Callers should render the empty/absent state for that case, not treat it
 * as a fetch failure.
 *
 * @param {string} [userId] - omit for bulk mode; pass an AD_User id for single mode.
 * @returns {Promise<{assignments?: Record<string, string[]>, userId?: string,
 *   templateRoleIds?: string[]}>}
 */
export async function fetchUserRoleAssignments(userId) {
  const params = new URLSearchParams();
  if (userId) params.set('UserId', userId);
  const query = params.toString();
  const url = `${NEO_BASE}/userroleassignments${query ? `?${query}` : ''}`;
  return fetchNeoJson(url, 'SFUserRoleAssignments');
}

/**
 * Persists the FULL desired set of template roles for a user via
 * `GET /sws/neo/assignuserroles?UserId=<id>&TemplateRoleIds=<id1,id2,...>` (ETP-4852 —
 * `SFAssignUserRoles.java`, unmodified by this task). This is a set-reconciliation call,
 * not additive: pass the complete desired `templateRoleIds`, not a delta — the backend
 * diffs it against the user's current composed roles and reports how many were
 * added/removed.
 *
 * `templateRoleIds` may be an empty array (clears every composed template role from the
 * user's personal role, leaving `AD_Role_Inheritance` with no active template entries).
 *
 * **Response shape branches on the body's own `success` flag, NOT the HTTP status** — the
 * backend deliberately returns HTTP 200 for both outcomes (see `SFAssignUserRoles`'s class
 * javadoc: it folds every expected domain-validation rejection into a `success:false` body
 * so the bridge's generic error/500 path is reserved for genuinely unexpected failures):
 *
 * - Success: `{"success": true, "userId": ..., "personalRoleId": ...,
 *   "templateRoleIds": [...], "added": N, "removed": N}` — resolved as-is.
 * - Domain rejection (bad user id, non-template role id, Admin role requested, caller not
 *   authorized, …): `{"success": false, "message": "..."}` — thrown as a JS `Error` whose
 *   message is that `message` field, so callers can surface it directly (e.g. in a toast).
 *
 * A genuine transport/parse failure (network error, non-2xx HTTP, non-JSON body) also
 * throws, via the same `fetchNeoJson` mechanics `fetchUserRoleAssignments` uses.
 *
 * @param {string} userId - AD_User id whose composed roles are being set.
 * @param {string[]} templateRoleIds - the complete desired set of template role ids.
 * @returns {Promise<{success: true, userId: string, personalRoleId: string,
 *   templateRoleIds: string[], added: number, removed: number}>}
 */
export async function saveUserRoleAssignments(userId, templateRoleIds) {
  const params = new URLSearchParams();
  params.set('UserId', userId);
  params.set('TemplateRoleIds', (templateRoleIds ?? []).join(','));
  const url = `${NEO_BASE}/assignuserroles?${params.toString()}`;
  const result = await fetchNeoJson(url, 'SFAssignUserRoles');
  if (result.success === false) {
    throw new Error(result.message || 'SFAssignUserRoles rejected the request');
  }
  return result;
}
