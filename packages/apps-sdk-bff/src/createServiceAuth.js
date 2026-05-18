/**
 * Service-account login cache for the Apps SDK BFF.
 *
 * The BFF authenticates inbound requests via RS256 (Etendo Go Apps JWT) but
 * NEO Headless upstream expects an Etendo-native JWT. The BFF maintains a
 * long-lived Etendo session via /sws/login with a service credential and
 * forwards that token upstream.
 *
 * Internal-apps v1 caveat: a dedicated service account + scoped role is the
 * responsibility of the operator. This module handles token lifecycle only.
 */
export function createServiceAuth({ etendoUrl, user, password, refreshSkewMs = 60_000 }) {
  if (!etendoUrl) throw new Error('createServiceAuth: etendoUrl is required');
  if (!user || !password) throw new Error('createServiceAuth: user and password are required');

  let cache = null; // { token, expiresAtMs }
  let pending = null;

  async function fetchToken() {
    const res = await fetch(`${etendoUrl}/sws/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Etendo login failed ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const token = json.token;
    if (!token) throw new Error('Etendo login returned no token');
    const payload = decodeJwtPayload(token);
    const expiresAtMs = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + 30 * 60_000;
    return { token, expiresAtMs };
  }

  async function getToken() {
    if (cache && cache.expiresAtMs - Date.now() > refreshSkewMs) return cache.token;
    if (!pending) {
      pending = fetchToken()
        .then((fresh) => { cache = fresh; return fresh.token; })
        .finally(() => { pending = null; });
    }
    return pending;
  }

  // Clears the cache and fetches a fresh token regardless of TTL.
  // Call this when the upstream rejects the cached token with 401/403.
  async function forceRefresh() {
    cache = null;
    pending = null;
    return getToken();
  }

  return { getToken, forceRefresh };
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return {};
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  try {
    return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}
