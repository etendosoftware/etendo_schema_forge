/**
 * ETP-5351 — support access: an Etendo operator enters a tenant as the "Soporte Etendo" user.
 *
 * Classic issues a single-use ticket and opens `<app>/support-access#t=<ticket>` in a new tab. The
 * ticket travels in the fragment so it never reaches a server or an access log; this module reads
 * it, takes it out of the address bar before anything else can see it, and redeems it for a GO
 * session marked as support (`POST /sws/go/session/support-handoff`). From then on `GET /sws/go/me`
 * answers `supportSession: {clientId, clientName, expiresAt}` instead of `null`.
 *
 * It is also the ONE place that knows whether the tab is in support mode. The state lives in a
 * module-level store rather than a React context because two of its readers sit outside React: the
 * telemetry gate (`lib/observability.js`), which must be closed BEFORE the providers are
 * initialized in `main.jsx`, and `fetchWindowAccess` (App.jsx), which AuthProvider calls as a plain
 * function. Components read it through `hooks/useSupportSession.js`.
 *
 * Why the store is seeded from localStorage at boot: `/me` answers only after the app has mounted,
 * and by then `main.jsx` has already initialized the analytics providers and sent `app_started`.
 * The marker written when a ticket is redeemed (and refreshed by every `/me` that confirms the
 * support session) lets every load of that browser start in support mode, in every tab, since the
 * session cookie is shared by all of them. It carries the expiry, so a marker left behind by a
 * session that ran out on its own stops counting the moment it expires.
 *
 * Plain module (no JSX): imports `apiFetch` from the core subpath, never the `@/auth/api.js`
 * barrel, so `node --test` can load it (see docs/request-policy.md).
 */
import { apiFetch, createApiFetch } from '@etendosoftware/app-shell-core/auth/api';

/** The router path Classic opens. Relative to the router base, like every other route. */
export const SUPPORT_ACCESS_PATH = '/support-access';
export const SUPPORT_HANDOFF_ENDPOINT = '/sws/go/session/support-handoff';
export const ACCOUNT_ENDPOINT = '/sws/go/me';
/** `#t=<ticket>` — the fragment parameter that carries the ticket. */
export const SUPPORT_TICKET_PARAM = 't';
/** The internal account email of the "Soporte Etendo" user (mirrors SupportAccessGuard.SUPPORT_ACCOUNT_EMAIL). */
export const SUPPORT_ACCOUNT_EMAIL = 'soporte@etendo-go.invalid';
export const SUPPORT_SESSION_STORAGE_KEY = 'sf_support_session';

// Plain string scan instead of a regex: an end-anchored "one or more slashes" pattern
// backtracks super-linearly on long slash runs (Sonar S5852).
function stripTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}
/**
 * How long the marker written right after a successful handoff keeps the browser in support mode
 * before `/me` has confirmed it. The handoff answer does not carry the expiry (it has the shape of
 * `/session/environment`), so this only has to cover the reload into the app.
 */
export const PROVISIONAL_MARKER_TTL_MS = 10 * 60 * 1000;

/** The three 401 codes of the handoff. The UI shows one message for all of them on purpose. */
export const SUPPORT_TICKET_ERRORS = Object.freeze({
  invalid: 'support_ticket_invalid',
  expired: 'support_ticket_expired',
  used: 'support_ticket_used',
});

/**
 * Why a handoff did not open a session:
 *  - `missing`: no ticket on this load (a reload after the fragment was stripped, a bare URL);
 *  - `rejected`: the backend refused the ticket (401: invalid, expired or already used);
 *  - `failed`: anything else (network, 403, 5xx, an unexpected answer).
 */
export const SUPPORT_HANDOFF_FAILURES = Object.freeze({
  missing: 'missing',
  rejected: 'rejected',
  failed: 'failed',
});

/**
 * Router entries that a support session must not reach: account settings (password, sign-in
 * methods, email, subscription), the upgrade/billing flow, the company list (ETP-5734: switching
 * company), and the screens that mint credentials
 * which outlive the session (public API keys, OAuth2 clients). The backend refuses all of them for
 * a support session; hiding them is what keeps the operator from walking into those refusals.
 */
export const SUPPORT_RESTRICTED_ROUTES = Object.freeze(['account', 'upgrade', 'companies', 'api-keys', 'oauth2-clients']);

/** The menu capability that marks an owner-only entry (menu.json `"capability": "isOwner"`). */
const OWNER_CAPABILITY = 'isOwner';

const INITIAL_STATE = Object.freeze({ status: 'unknown', session: null });

/**
 * `status` is `unknown` until something decides it, `support` while the browser is in a support
 * session, and `none` once `/me` has confirmed there is none.
 */
let state = INITIAL_STATE;
const listeners = new Set();
let pendingTicket = null;
let pendingHandoff = null;

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage || null;
  } catch {
    return null;
  }
}

function publish(next) {
  if (next.status === state.status && sameSession(next.session, state.session)) return;
  state = Object.freeze({ status: next.status, session: next.session });
  for (const listener of listeners) listener(state);
}

function sameSession(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.clientId === b.clientId && a.clientName === b.clientName && a.expiresAt === b.expiresAt;
}

export function getSupportSessionState() {
  return state;
}

export function subscribeSupportSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isSupportModeActive(current = state) {
  return current?.status === 'support';
}

/**
 * The ticket carried by a location fragment (`#t=<ticket>`), or null.
 *
 * The ticket is opaque and taken as-is. `URLSearchParams` decodes `+` to a space, so the backend
 * has to issue it URL-safe (hex or base64url), which a value meant to travel in a URL is anyway.
 */
export function parseSupportTicket(hash) {
  if (typeof hash !== 'string') return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const ticket = new URLSearchParams(raw).get(SUPPORT_TICKET_PARAM);
  return ticket || null;
}

/**
 * Whether `pathname` is the handoff route under `routerBase` (`/` at the domain root,
 * `/<context>/web/<module>` when the app is served by Tomcat). Only the exact route counts: a
 * `/support-access` segment deeper in another path is something else.
 */
export function isSupportAccessPath(pathname, routerBase = '/') {
  if (typeof pathname !== 'string') return false;
  const base = typeof routerBase === 'string' ? stripTrailingSlashes(routerBase) : '';
  if (base && pathname !== base && !pathname.startsWith(`${base}/`)) return false;
  const routed = stripTrailingSlashes(pathname.slice(base.length));
  return routed === SUPPORT_ACCESS_PATH;
}

/**
 * Reads the ticket off the handoff URL and removes the fragment from the address bar and from the
 * current history entry, so a reload, a Back or a copied URL never carries it again. Returns the
 * ticket, or null when this is not the handoff route or it came without one.
 */
export function consumeSupportTicket({ location, history, routerBase = '/' } = {}) {
  if (!location || !isSupportAccessPath(location.pathname, routerBase)) return null;
  const ticket = parseSupportTicket(location.hash);
  if (location.hash && typeof history?.replaceState === 'function') {
    history.replaceState(history.state, '', `${location.pathname}${location.search || ''}`);
  }
  return ticket;
}

/** `/me`'s `supportSession`, normalized; null when the session is not a support one. */
export function normalizeSupportSession(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = (value) => (typeof value === 'string' && value ? value : null);
  return {
    clientId: text(raw.clientId),
    clientName: text(raw.clientName),
    expiresAt: text(raw.expiresAt),
  };
}

function readMarker(storage, now) {
  let marker;
  try {
    marker = JSON.parse(storage?.getItem(SUPPORT_SESSION_STORAGE_KEY) || 'null');
  } catch {
    marker = null;
  }
  if (!marker || typeof marker !== 'object') return null;
  const expiresAt = Date.parse(marker.expiresAt);
  const validUntil = Number.isFinite(expiresAt) ? expiresAt : Number(marker.provisionalUntil);
  if (!Number.isFinite(validUntil) || validUntil <= now) {
    forgetSupportSessionMarker(storage);
    return null;
  }
  return marker;
}

function writeMarker(storage, marker) {
  try {
    storage?.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(marker));
  } catch {
    // Storage disabled: the tab still learns the mode from /me, only later.
  }
}

/** Removes the persisted marker. Leaves this tab's in-memory state alone (see `useLogout`). */
export function forgetSupportSessionMarker(storage = browserStorage()) {
  try {
    storage?.removeItem(SUPPORT_SESSION_STORAGE_KEY);
  } catch {
    // ignore — same as writeMarker
  }
}

/**
 * Runs once, in `main.jsx`, before telemetry is initialized: takes the ticket out of the URL and
 * decides the mode this load starts in. The handoff page itself starts in support mode even
 * without a marker, so nothing it does is reported as the operator's own visit.
 */
export function bootSupportSession({
  location = typeof window === 'undefined' ? null : window.location,
  history = typeof window === 'undefined' ? null : window.history,
  storage = browserStorage(),
  routerBase = '/',
  now = Date.now(),
} = {}) {
  pendingTicket = consumeSupportTicket({ location, history, routerBase });
  const marker = readMarker(storage, now);
  if (marker) {
    publish({ status: 'support', session: normalizeSupportSession(marker) });
  } else if (location && isSupportAccessPath(location.pathname, routerBase)) {
    publish({ status: 'support', session: null });
  }
  return state;
}

/** Hands over the ticket read at boot, once. */
export function takeSupportTicket() {
  const ticket = pendingTicket;
  pendingTicket = null;
  return ticket;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** The 401 code, flat (`{error: "support_ticket_used"}`) or in the servlet's nested envelope. */
function readErrorCode(payload) {
  if (typeof payload?.error === 'string') return payload.error;
  return payload?.error?.code || null;
}

/**
 * The request the handoff goes through: a client OUTSIDE the ambient session scope
 * (`createApiFetch`'s 4th argument `null` opts out).
 *
 * The handoff page loads with AuthProvider restoring the session in parallel (`GET
 * /sws/go/session`), and that restore ends by replacing the session identity — `logout()` on the
 * usual 401, or adopting the restored session on a 200 — which advances the controller's
 * generation. The ambient `apiFetch` captures the identity when the POST is dispatched and
 * checks it again when the answer arrives; if the restore settled in between, it threw
 * `staleSessionError` for a handoff the backend HAD accepted: the ticket was spent, no session
 * was shown, and the page read "no se pudo abrir el acceso" (reason `failed`). The handoff
 * belongs to no session by definition — it is what creates one — so it has no identity to lose.
 */
const handoffFetch = (path, options) => createApiFetch(undefined, () => null, null, null)(path, options);

/**
 * Redeems a ticket. Resolves `{ok: true, data}` with the handoff answer (same shape as
 * `POST /sws/go/session/environment`) or `{ok: false, reason, code?}`; never rejects.
 *
 * `on401: 'ignore'`: a 401 here is the backend refusing the ticket, not a session that expired.
 */
export async function redeemSupportTicket(ticket, { request = handoffFetch } = {}) {
  if (!ticket) return { ok: false, reason: SUPPORT_HANDOFF_FAILURES.missing };
  let response;
  try {
    response = await request(SUPPORT_HANDOFF_ENDPOINT, {
      method: 'POST',
      on401: 'ignore',
      body: JSON.stringify({ ticket }),
    });
  } catch {
    return { ok: false, reason: SUPPORT_HANDOFF_FAILURES.failed };
  }
  const payload = await readJson(response);
  if (response.status === 401) {
    return { ok: false, reason: SUPPORT_HANDOFF_FAILURES.rejected, code: readErrorCode(payload) };
  }
  // `status` is the success signal of the environment login this mirrors (see OnboardingFlow);
  // a 200 that says otherwise did not open a session.
  if (!response.ok || (payload?.status && payload.status !== 'success')) {
    return { ok: false, reason: SUPPORT_HANDOFF_FAILURES.failed };
  }
  return { ok: true, data: payload };
}

/**
 * Redeems the ticket read at boot. Memoized per page load: the ticket is single-use, so a second
 * effect run (StrictMode, a remount) must share the first request instead of firing a ticketless
 * one that would report the access as expired.
 */
export function redeemPendingSupportTicket(options) {
  if (!pendingHandoff) pendingHandoff = redeemSupportTicket(takeSupportTicket(), options);
  return pendingHandoff;
}

/** Joins a router base and an app path into an href (`/` + `/dashboard` → `/dashboard`). */
export function buildAppHref(routerBase, path) {
  const base = typeof routerBase === 'string' ? stripTrailingSlashes(routerBase) : '';
  return `${base}${path}`;
}

/**
 * After a successful handoff: enters the app the way the environment login does (OnboardingFlow) —
 * service-worker caches dropped, `etendo-go:navigating` announced so a concurrent SW update does
 * not reload over the redirect, then a full load of the home page so every cache keyed on the
 * previous session goes. `replace`, so Back does not return to a handoff page whose ticket is gone.
 *
 * Unlike the environment login it does NOT remember the tenant as the last one used: that
 * preference belongs to the operator's own account, not to a tenant they visited as support.
 */
export async function completeSupportHandoff(data, {
  win = window,
  storage = browserStorage(),
  routerBase = '/',
  now = Date.now(),
} = {}) {
  writeMarker(storage, {
    clientId: data?.environment?.clientId || null,
    clientName: null,
    expiresAt: null,
    provisionalUntil: now + PROVISIONAL_MARKER_TTL_MS,
  });
  if (win.caches && typeof win.caches.keys === 'function') {
    try {
      const names = await win.caches.keys();
      await Promise.all(names.map((name) => win.caches.delete(name)));
    } catch {
      // A stale cache only costs a fresh download; it must not block the entry.
    }
  }
  win.dispatchEvent(new Event('etendo-go:navigating'));
  win.location.replace(buildAppHref(routerBase, '/dashboard'));
}

/**
 * Reads `supportSession` off `GET /sws/go/me`. Rejects when the account cannot be read, so the
 * caller keeps the mode it has instead of taking a failed read for "no support session".
 */
export async function fetchSupportSession({ request = apiFetch } = {}) {
  const response = await request(ACCOUNT_ENDPOINT, { on401: 'ignore' });
  // The session is gone: a marker left behind would start the next load in support mode.
  if (response.status === 401) forgetSupportSessionMarker();
  if (!response.ok) throw new Error(`GET ${ACCOUNT_ENDPOINT} answered ${response.status}`);
  const payload = await readJson(response);
  return normalizeSupportSession(payload?.supportSession);
}

/** Applies what `/me` said: a support session (persisted for the next loads) or none. */
export function applySupportSessionFromServer(session, { storage = browserStorage() } = {}) {
  if (session) {
    writeMarker(storage, session);
    publish({ status: 'support', session });
  } else {
    forgetSupportSessionMarker(storage);
    publish({ status: 'none', session: null });
  }
}

export function isSupportRestrictedRoute(name) {
  return SUPPORT_RESTRICTED_ROUTES.includes(String(name ?? '').replace(/^\/+/, ''));
}

/** Drops the restricted and the owner-only entries from menu groups (the menu.json shape). */
export function hideSupportRestrictedMenuItems(groups) {
  if (!Array.isArray(groups)) return groups;
  return groups.map((group) => ({
    ...group,
    items: (group.items || []).filter((item) => !isSupportRestrictedMenuItem(item)),
  }));
}

export function isSupportRestrictedMenuItem(item) {
  return isSupportRestrictedRoute(item?.path || item?.name) || item?.capability === OWNER_CAPABILITY;
}

/**
 * The window-access payload as a support session must see it: never the owner. The support user
 * is not the owner server-side either (`OwnerSupport` ignores it); forcing it here as well keeps
 * every `capabilities.isOwner` check in the app closed even against a backend that got it wrong.
 */
export function withSupportModeCapabilities(payload, current = state) {
  if (!payload || !isSupportModeActive(current) || !payload.capabilities) return payload;
  return { ...payload, capabilities: { ...payload.capabilities, [OWNER_CAPABILITY]: false } };
}

/** `expiresAt` as a local `HH:MM` in the UI locale (`es_ES` → `es-ES`), or null when unusable. */
export function formatSupportExpiry(expiresAt, locale = 'es_ES') {
  const instant = Date.parse(expiresAt);
  if (!Number.isFinite(instant)) return null;
  return new Date(instant).toLocaleTimeString(String(locale || 'es_ES').replace('_', '-'), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Test-only: the store and the pending ticket are per page load, so tests reset them. Listeners
 * are kept and told: the telemetry gate subscribes once, when `lib/observability.js` loads.
 */
export function resetSupportSessionForTests() {
  pendingTicket = null;
  pendingHandoff = null;
  publish(INITIAL_STATE);
}
