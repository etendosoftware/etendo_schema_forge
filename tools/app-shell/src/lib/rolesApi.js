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
 * Shared fetch + response-unwrap logic for the `SFRolesOverview`/`SFSystemRoleTemplates`
 * webhook family — both are reached through the NEO pseudo-spec bridge (`NeoGoWebhookBridge`
 * in `com.etendoerp.go`, see its class javadoc) rather than the Webhooks module's
 * `/webhooks/*` dispatch, and both reproduce the exact same `{result: "<json-string>"}` /
 * `{error: "<message>"}` response envelope, so this one helper serves either. `webhookName`
 * is only used to make error messages point at the right backend class.
 *
 * Same fetch conventions as `lib/menuTree.js`'s `callMenuWebhook` — this must run as the
 * CURRENT logged-in user's own role (`sf_auth_token`), not an admin token, since the backend
 * itself decides admin/client-admin access (`NeoAccessHelper.isAdminOrClientAdmin`) from that
 * same role. A non-admin caller (or no role at all) gets `{ roles: [] }` back from the backend
 * — that is not an error, it's the documented "denied" shape — callers should render the
 * empty-state message for `roles.length === 0`, not treat it as a fetch failure.
 *
 * No `Content-Type` header: this is a GET with no body, and `application/json` isn't a
 * CORS-safelisted value — setting it unnecessarily triggers a preflight OPTIONS request (and
 * risks it failing) whenever `VITE_API_BASE` points at a different origin than the SPA.
 *
 * @param {string} path - the NEO pseudo-spec path segment (e.g. `'rolesoverview'`).
 * @param {string} webhookName - the backend webhook class name, for error messages only
 *   (e.g. `'SFRolesOverview'`).
 * @returns {Promise<object>} the unwrapped `{roles: [...]}` payload.
 */
async function fetchNeoWebhookRoles(path, webhookName) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${NEO_BASE}/${path}`, { headers });
  const text = await res.text();
  let data;
  let parsed = true;
  try { data = JSON.parse(text); } catch { data = text; parsed = false; }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `${webhookName} error: ${res.status}`);
  }
  // A 200 with a non-JSON body (e.g. a SPA-fallback index.html served when this endpoint isn't
  // actually backed — no dev proxy, no backend, as in most E2E test environments) must be
  // treated as a failure rather than silently resolving to an empty-but-valid roles list.
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
  if (Array.isArray(data.roles)) {
    return data;
  }
  throw new Error(`${webhookName} returned an unexpected shape`);
}

/**
 * Fetches the GOClient roles overview from `GET /sws/neo/rolesoverview` (ETP-4513).
 *
 * Reached via NEO Headless's own JWT auth, not the Webhooks module's `/webhooks/SFRolesOverview`
 * — that path additionally requires a per-(webhook, role) grant row in
 * `SMFWHE_DEFINEDWEBHOOK_ROLE`, which `update.database` wipes back to its XML baseline. See
 * `NeoGoWebhookBridge`'s class javadoc in `com.etendoerp.go` for the full rationale. Same
 * backend Java class (`SFRolesOverview`) and response shape either way, only the transport
 * changed.
 *
 * Defensively unwraps the `{ result: "<json-string>" }` shape this webhook family returns (see
 * `SFRolesOverview.java`'s `responseVars.put("result", ...)`), same as `menuTree.js`'s
 * `fetchMenuTree`.
 *
 * **Tenant-scoped by design — not a source of composable template roles going forward.**
 * This webhook always resolves the CALLING tenant's own client's copies of the 4 fixed roles
 * (plus its client-admin row) — correct for its own ETP-4513 "Configuración > Roles" page, but
 * NOT what the multi-role assignment UI should use to populate the SELECTABLE template list
 * (see `fetchTemplateRoles()` below for why, and for the ETP-4906 fix this became for once a
 * tenant deactivates its own per-client role copies). Callers that only need the client-admin
 * row (e.g. `RoleChipsCell.jsx`'s `useUserRoleGridData`) still use this function for that one
 * purpose alongside `fetchTemplateRoles()`.
 *
 * @returns {Promise<{roles: Array<{id: string, name: string, rawDescription: string,
 *   userCount: number, isClientAdmin?: boolean, windows: Array<{id: string, name: string,
 *   tier: string}>}>}>}
 */
export async function fetchRolesOverview() {
  return fetchNeoWebhookRoles('rolesoverview', 'SFRolesOverview');
}

/**
 * Fetches the 4 fixed, SYSTEM-LEVEL role templates (Finance/Sales/Purchasing/Inventory,
 * `AD_Client_ID = '0'`) from `GET /sws/neo/systemroletemplates` (ETP-4906, `SFSystemRoleTemplates`
 * in `com.etendoerp.go`).
 *
 * **Why this exists, and why it's not just `fetchRolesOverview()`.** `fetchRolesOverview()`
 * resolves the CALLER's own tenant's copies of these 4 roles — by design, for the unrelated
 * ETP-4513 "Configuración > Roles" page. Once a tenant deactivates (or never had) its own
 * per-client copies, that query legitimately returns nothing for them, leaving the multi-role
 * assignment UI (`AssignTemplateRolesControl.jsx`, `UserRolesTab.jsx`, and — combined with
 * `fetchRolesOverview()`'s client-admin row — `RoleChipsCell.jsx`/`RoleFilterControl.jsx`) with
 * nothing to offer. This function always resolves the same 4 role NAMES at the system client
 * instead, matching the ticket's target architecture: "no template role should be at client
 * level, only at system level."
 *
 * Same unwrap/error conventions as `fetchRolesOverview()` (shared via `fetchNeoWebhookRoles`).
 * No `userCount`, no client-admin row in the response — see `SFSystemRoleTemplates.java`'s class
 * javadoc for why. Combine with `fetchRolesOverview()` when a caller also needs the tenant's
 * client-admin row (e.g. the Users grid's role filter/chips, which must still surface classic
 * Admin users).
 *
 * @returns {Promise<{roles: Array<{id: string, name: string,
 *   windows: Array<{id: string, name: string, tier: string}>}>}>}
 */
export async function fetchTemplateRoles() {
  return fetchNeoWebhookRoles('systemroletemplates', 'SFSystemRoleTemplates');
}
