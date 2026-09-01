import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
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

// Deliberately NOT `useDiscovery.js`'s `callWebhook()` (admin token via
// `adminAuthHeaders()`, POST) — this fetch must run as the CURRENT logged-in
// user's own role (`sf_auth_token`), since SFListMenu's whole point here is
// returning a tree scoped to that role. Using the admin token would always
// return the unfiltered tree, defeating useRoleMenu()'s purpose. Explorer's
// own `fetchMenuTree` caller (`AddSpec.jsx`'s MenuSelector, admin-only dev
// tooling, not routed in the shipped app) inherits this same-user-token
// behavior via the re-export in `explorer/useDiscovery.js` — harmless today
// since that tool isn't reachable, but worth revisiting if it ever is.
//
// Reached via `/sws/neo/listmenu` (NEO Headless's own JWT auth), not
// `/webhooks/SFListMenu` — the Webhooks module additionally requires a
// per-(webhook, role) grant row in SMFWHE_DEFINEDWEBHOOK_ROLE, which
// `update.database` wipes back to its XML baseline. See NeoGoWebhookBridge's
// class javadoc in com.etendoerp.go for the full rationale. Same backend
// Java class (SFListMenu) and response shape either way, only the transport
// changed.
async function callMenuWebhook(params) {
  const url = `${NEO_BASE}/listmenu`;
  const token = getToken();
  // apiFetch sets NO Content-Type on a bodyless request, preserving the reason these headers
  // were once hand-built: a GET has no body, and application/json isn't a CORS-safelisted
  // value, so setting it would trigger a preflight OPTIONS whenever VITE_API_BASE points at a
  // different origin than the SPA. It also sends Accept-Language — which IS CORS-safelisted,
  // so the preflight concern still doesn't apply — without which the menu labels came back in
  // the AD language (ETP-5022).
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(query ? `${url}?${query}` : url, { baseUrl: '', token });
  const text = await res.text();
  let data;
  let parsed = true;
  try { data = JSON.parse(text); } catch { data = text; parsed = false; }
  if (!res.ok) throw new Error(data?.error || data?.message || `SFListMenu error: ${res.status}`);
  // A 200 with a non-JSON body (e.g. a SPA-fallback index.html served when this
  // endpoint isn't actually backed — no dev proxy, no backend, as in most E2E
  // test environments) must be treated as a failure, not a silently "successful"
  // response: letting a raw string through would resolve to an empty-but-valid
  // allowed-id Set downstream, which permanently hides every AD-backed menu item
  // instead of failing open like a real error does.
  if (!parsed || typeof data !== 'object' || data === null) {
    throw new Error('SFListMenu returned a non-JSON response');
  }
  return data;
}

/**
 * Fetches the role-filtered AD_Menu tree. Full tree with no args; `?q=` for a flat
 * name-substring search. See com.etendoerp.go docs/neo-headless.md §8 for the response
 * shape ({ tree, count }) and the server-side role-filtering rules.
 */
export async function fetchMenuTree(query) {
  const params = {};
  if (query) params.q = query;
  const data = await callMenuWebhook(params);
  if (typeof data.result === 'string') {
    try { return JSON.parse(data.result); } catch { /* fall through */ }
  }
  return data;
}

/**
 * Walks a role-filtered menu tree and collects every windowId/processId/
 * obuiappProcessId it carries, at any depth. Used to filter the static menu.json
 * against what this role can actually reach (see useRoleMenu.js).
 */
export function collectAllowedIds(tree, into = new Set()) {
  for (const node of tree ?? []) {
    if (node.windowId) into.add(String(node.windowId));
    if (node.processId) into.add(String(node.processId));
    if (node.obuiappProcessId) into.add(String(node.obuiappProcessId));
    if (node.children) collectAllowedIds(node.children, into);
  }
  return into;
}
