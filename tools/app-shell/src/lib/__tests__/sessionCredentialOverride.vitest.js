import {
  registerApiSession,
  resetApiSessionForTests,
} from '@etendosoftware/app-shell-core/auth/api';
import {
  resetSessionCredentials,
  setSessionCredentials,
} from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';

import { fetchMenuTree } from '../menuTree.js';
import { fetchNeoWebhookJson } from '../neoWebhookClient.js';

/**
 * ETP-5455 — `menuTree.js` and `neoWebhookClient.js` read `sf_auth_token` from localStorage and
 * handed it to `apiFetch` as an explicit `token`. The `Authorization` header is built from
 * `sessionCredentials`, but in bearer mode an explicit token WINS over it
 * (`credentialHeadersForToken`). Nothing writes that key since the cookie session (ADR-0001), so
 * normally the read came back null and the session bearer went out — but a leftover key from an
 * older build silently replaced the live bearer with a stale one.
 *
 * Pinned here: the role-filtered menu (SFListMenu) and the NEO webhook APIs built on
 * `fetchNeoWebhookJson` send exactly the active scheme's credential — the session bearer under
 * `bearer`, none under `cookie` — whatever the legacy key holds.
 */
const SESSION_TOKEN = 'session-bearer-token';
const STALE_LEGACY_TOKEN = 'stale-legacy-token';

function okJson(body) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function sentHeaders(fetchMock) {
  expect(fetchMock).toHaveBeenCalled();
  return new Headers(fetchMock.mock.calls[0][1]?.headers || {});
}

describe('ETP-5455 — plain-module NEO clients send the active scheme\'s credential', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn().mockResolvedValue(okJson({ tree: [], count: 0 }));
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    resetApiSessionForTests();
    resetSessionCredentials();
  });

  describe('under the bearer scheme', () => {
    beforeEach(() => {
      registerApiSession({ getToken: () => SESSION_TOKEN });
      setSessionCredentials({ mode: 'bearer', token: () => SESSION_TOKEN });
    });

    it('fetchMenuTree sends the session bearer, not an empty legacy override', async () => {
      await fetchMenuTree();

      expect(sentHeaders(fetchMock).get('Authorization')).toBe(`Bearer ${SESSION_TOKEN}`);
    });

    it('fetchNeoWebhookJson sends the session bearer, not an empty legacy override', async () => {
      await fetchNeoWebhookJson('/sws/neo/rolesoverview', 'SFRolesOverview', (data) => data);

      expect(sentHeaders(fetchMock).get('Authorization')).toBe(`Bearer ${SESSION_TOKEN}`);
    });

    it('fetchMenuTree ignores a leftover legacy sf_auth_token', async () => {
      localStorage.setItem('sf_auth_token', STALE_LEGACY_TOKEN);

      await fetchMenuTree();

      expect(sentHeaders(fetchMock).get('Authorization')).toBe(`Bearer ${SESSION_TOKEN}`);
    });

    it('fetchNeoWebhookJson ignores a leftover legacy sf_auth_token', async () => {
      localStorage.setItem('sf_auth_token', STALE_LEGACY_TOKEN);

      await fetchNeoWebhookJson('/sws/neo/rolesoverview', 'SFRolesOverview', (data) => data);

      expect(sentHeaders(fetchMock).get('Authorization')).toBe(`Bearer ${SESSION_TOKEN}`);
    });
  });

  describe('under the cookie scheme', () => {
    beforeEach(() => {
      registerApiSession({ getToken: () => null });
      setSessionCredentials({ mode: 'cookie', token: null, csrfToken: 'csrf-1' });
    });

    it('fetchMenuTree sends no Authorization header', async () => {
      await fetchMenuTree();

      expect(sentHeaders(fetchMock).has('Authorization')).toBe(false);
    });

    it('fetchNeoWebhookJson sends no Authorization header', async () => {
      await fetchNeoWebhookJson('/sws/neo/rolesoverview', 'SFRolesOverview', (data) => data);

      expect(sentHeaders(fetchMock).has('Authorization')).toBe(false);
    });
  });
});
