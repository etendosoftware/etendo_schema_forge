/**
 * Who is signed in, for the plain modules that are not React components and so cannot call
 * `useAuth()` — feature-flag targeting (`lib/flags/bootstrap.js`) and analytics grouping
 * (`lib/observability/health-events.js`).
 *
 * ETP-5455 — those modules used to read the legacy `sf_auth_user` / `sf_auth_client_id` /
 * `sf_auth_client_name` localStorage keys. Nothing writes them since the cookie session
 * (ADR-0001), so targeting and grouping silently fell back to "anonymous". The identity now lives
 * here, in memory, fed from the session itself:
 *   - `trackSessionStarted` when an environment is entered (it knows the client name);
 *   - `useAccountIdentity` on every mount of the authenticated shell, i.e. after a reload
 *     (username and client from `useAuth()`).
 * The logout clears it (`clearAccountIdentity`).
 *
 * Deliberately import-free and in memory: nothing here is a credential, and persisting who was
 * signed in is exactly the leak ETP-5202 removed from localStorage.
 */

let current = {};
let identityEpoch = 0;

function definedEntries(identity) {
  return Object.fromEntries(
    Object.entries(identity).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

/**
 * Records who is signed in. Fields that are absent keep their previous value, except the client
 * name, which is dropped when the client changes, so a tenant is never labelled with another
 * tenant's name.
 *
 * @param {{username?: string, clientId?: string, clientName?: string}} identity
 */
export function setSessionIdentity({ username, clientId, clientName } = {}) {
  const next = definedEntries({ username, clientId, clientName });
  const clientChanged = next.clientId !== undefined && next.clientId !== current.clientId;
  const base = clientChanged ? definedEntries({ ...current, clientName: undefined }) : current;
  const updated = { ...base, ...next };
  if (updated.username !== current.username || updated.clientId !== current.clientId) identityEpoch += 1;
  current = updated;
}

/** Returns a copy of the signed-in identity; `{}` when nobody is signed in. */
export function getSessionIdentity() {
  return { ...current };
}

/** Captures session ownership across awaits, including a logout/relogin with identical fields. */
export function getSessionIdentityEpoch() {
  return identityEpoch;
}

/** Forgets the signed-in identity. Every reset invalidates pending work, even when already empty. */
export function clearSessionIdentity() {
  identityEpoch += 1;
  current = {};
}
