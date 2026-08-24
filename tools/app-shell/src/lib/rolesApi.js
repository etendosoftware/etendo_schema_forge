import { NEO_BASE, fetchNeoWebhookJson } from './neoWebhookClient.js';

// A non-admin caller (or no role at all) gets `{ roles: [] }` back from the backend for both
// webhooks below — that is not an error, it's the documented "denied" shape — callers should
// render the empty-state message for `roles.length === 0`, not treat it as a fetch failure.
// Shared fetch/parse/unwrap mechanics (base URL, token, `{result: "<json-string>"}` envelope)
// live in `neoWebhookClient.js`'s `fetchNeoWebhookJson` — see that module for the full
// rationale (no `Content-Type` header, fresh token per call, etc.).
const rolesFallback = (data) => (Array.isArray(data.roles) ? data : null);

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
  return fetchNeoWebhookJson(`${NEO_BASE}/rolesoverview`, 'SFRolesOverview', rolesFallback);
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
 * Same unwrap/error conventions as `fetchRolesOverview()` (shared via `neoWebhookClient.js`'s
 * `fetchNeoWebhookJson`).
 * No `userCount`, no client-admin row in the response — see `SFSystemRoleTemplates.java`'s class
 * javadoc for why. Combine with `fetchRolesOverview()` when a caller also needs the tenant's
 * client-admin row (e.g. the Users grid's role filter/chips, which must still surface classic
 * Admin users).
 *
 * @returns {Promise<{roles: Array<{id: string, name: string,
 *   windows: Array<{id: string, name: string, tier: string}>}>}>}
 */
export async function fetchTemplateRoles() {
  return fetchNeoWebhookJson(`${NEO_BASE}/systemroletemplates`, 'SFSystemRoleTemplates', rolesFallback);
}
