import { NEO_BASE, fetchNeoWebhookJson } from './neoWebhookClient.js';

// Fallback: the bridge already handed back the unwrapped shape directly (mirrors
// rolesApi.js's `Array.isArray(data.roles)` fallback for its own response shape).
// Shared fetch/parse/unwrap mechanics (base URL, token, `{result: "<json-string>"}`
// envelope) live in `neoWebhookClient.js`'s `fetchNeoWebhookJson` — see that module
// for the full rationale (no `Content-Type` header, fresh token per call, etc.).
const assignmentsFallback = (data) =>
  ('assignments' in data || 'templateRoleIds' in data || 'success' in data) ? data : null;

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
  const queryPart = query ? `?${query}` : '';
  const url = `${NEO_BASE}/userroleassignments${queryPart}`;
  return fetchNeoWebhookJson(url, 'SFUserRoleAssignments', assignmentsFallback);
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
 * throws, via the same `fetchNeoWebhookJson` mechanics `fetchUserRoleAssignments` uses.
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
  const result = await fetchNeoWebhookJson(url, 'SFAssignUserRoles', assignmentsFallback);
  if (result.success === false) {
    throw new Error(result.message || 'SFAssignUserRoles rejected the request');
  }
  return result;
}
