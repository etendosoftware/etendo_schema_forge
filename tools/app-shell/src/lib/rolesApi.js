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
 * Fetches the GOClient roles overview from `GET /sws/neo/rolesoverview` (ETP-4513).
 *
 * Reached via NEO Headless's own JWT auth, not the Webhooks module's `/webhooks/SFRolesOverview`
 * — that path additionally requires a per-(webhook, role) grant row in
 * `SMFWHE_DEFINEDWEBHOOK_ROLE`, which `update.database` wipes back to its XML baseline. See
 * `NeoGoWebhookBridge`'s class javadoc in `com.etendoerp.go` for the full rationale. Same
 * backend Java class (`SFRolesOverview`) and response shape either way, only the transport
 * changed.
 *
 * Same fetch conventions as `lib/menuTree.js`'s `callMenuWebhook` — this must run as the
 * CURRENT logged-in user's own role (`sf_auth_token`), not an admin token, since the backend
 * itself decides admin/client-admin access (`NeoAccessHelper.isAdminOrClientAdmin`) from that
 * same role. A non-admin caller (or no role at all) gets `{ roles: [] }` back from the backend
 * — that is not an error, it's the documented "denied" shape (see SFRolesOverview.java's class
 * javadoc) — callers should render the empty-state message for `roles.length === 0`, not treat
 * it as a fetch failure.
 *
 * No `Content-Type` header: this is a GET with no body, and `application/json` isn't a
 * CORS-safelisted value — setting it unnecessarily triggers a preflight OPTIONS request (and
 * risks it failing) whenever `VITE_API_BASE` points at a different origin than the SPA.
 *
 * Defensively unwraps the `{ result: "<json-string>" }` shape this webhook family returns (see
 * `SFRolesOverview.java`'s `responseVars.put("result", ...)`), same as `menuTree.js`'s
 * `fetchMenuTree`.
 *
 * @returns {Promise<{roles: Array<{id: string, name: string, rawDescription: string,
 *   userCount: number, windows: Array<{id: string, name: string, tier: string}>}>}>}
 */
export async function fetchRolesOverview() {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${NEO_BASE}/rolesoverview`, { headers });
  const text = await res.text();
  let data;
  let parsed = true;
  try { data = JSON.parse(text); } catch { data = text; parsed = false; }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `SFRolesOverview error: ${res.status}`);
  }
  // A 200 with a non-JSON body (e.g. a SPA-fallback index.html served when this endpoint isn't
  // actually backed — no dev proxy, no backend, as in most E2E test environments) must be
  // treated as a failure rather than silently resolving to an empty-but-valid roles list.
  if (!parsed || typeof data !== 'object' || data === null) {
    throw new Error('SFRolesOverview returned a non-JSON response');
  }
  if (data.error) {
    throw new Error(data.error);
  }
  if (typeof data.result === 'string') {
    try {
      return JSON.parse(data.result);
    } catch {
      throw new Error('SFRolesOverview returned an invalid result payload');
    }
  }
  if (data.result && typeof data.result === 'object' && !Array.isArray(data.result)) {
    return data.result;
  }
  if (Array.isArray(data.roles)) {
    return data;
  }
  throw new Error('SFRolesOverview returned an unexpected shape');
}
