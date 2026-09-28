import {
  resetSessionCredentials,
  setSessionCredentials,
} from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';
import { fetchRolesOverview } from '../rolesApi.js';

// ETP-4513 — fetchRolesOverview() mirrors menuTree.js's fetchMenuTree()
// conventions almost exactly (same-origin GET, `{result: "<json-string>"}`
// unwrap, non-JSON-200 rejection), so this file's coverage mirrors
// menuTree.vitest.js's structure and edge cases, adapted to rolesApi's own
// extra branches (a `data.result` that is already an object, and an explicit
// `data.error` field).
describe('rolesApi', () => {
  describe('fetchRolesOverview', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
      localStorage.clear();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      resetSessionCredentials();
      localStorage.clear();
    });

    it('returns the roles payload directly when the response already has a `roles` array', async () => {
      const raw = { roles: [{ id: '1', name: 'GOClient Admin', userCount: 2, windows: [] }] };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(raw),
      });

      const data = await fetchRolesOverview();

      expect(data).toEqual(raw);
    });

    it('parses data.result when it is itself a JSON string, returning the parsed inner object', async () => {
      const inner = { roles: [{ id: '1', name: 'Finance', userCount: 1, windows: [] }] };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: JSON.stringify(inner) }),
      });

      const data = await fetchRolesOverview();

      expect(data).toEqual(inner);
    });

    it('returns data.result directly when it is already an object (not a JSON string)', async () => {
      const inner = { roles: [{ id: '1', name: 'Sales', userCount: 0, windows: [] }] };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: inner }),
      });

      const data = await fetchRolesOverview();

      expect(data).toEqual(inner);
    });

    it('rejects when the 200 response body is not valid JSON (e.g. an HTML SPA-fallback page)', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<!doctype html><html><body>App</body></html>',
      });

      await expect(fetchRolesOverview()).rejects.toThrow(/non-JSON/);
    });

    it('rejects with data.error when the backend returns an explicit error field on a 200', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ error: 'access denied' }),
      });

      await expect(fetchRolesOverview()).rejects.toThrow('access denied');
    });

    it('rejects with data.result-is-invalid-JSON message when data.result is a string that fails to parse', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: 'not-json-{{{' }),
      });

      await expect(fetchRolesOverview()).rejects.toThrow(/invalid result payload/);
    });

    it('rejects with an "unexpected shape" message when the body is a JSON object with neither result nor roles', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ somethingElse: true }),
      });

      await expect(fetchRolesOverview()).rejects.toThrow(/unexpected shape/);
    });

    it('rejects using data.error when the response is not ok and carries an error field', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: 'Forbidden' }),
      });

      await expect(fetchRolesOverview()).rejects.toThrow('Forbidden');
    });

    it('rejects using data.message when the response is not ok and has no error field', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ message: 'Internal error' }),
      });

      await expect(fetchRolesOverview()).rejects.toThrow('Internal error');
    });

    it('falls back to a generic "SFRolesOverview error: <status>" message when not ok and no error/message field is present', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({}),
      });

      await expect(fetchRolesOverview()).rejects.toThrow('SFRolesOverview error: 500');
    });

    it('requests the SFRolesOverview endpoint path via NEO Headless', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ roles: [] }),
      });

      await fetchRolesOverview();

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('/sws/neo/rolesoverview');
    });

    // ETP-5455 — the credential comes from the active session scheme. The module used to hand
    // apiFetch `localStorage.sf_auth_token` as an explicit `token`, and an explicit token WINS over
    // the session's in bearer mode — so a leftover key silently replaced the live bearer.
    it('wires the Authorization header from the session bearer', async () => {
      setSessionCredentials({ mode: 'bearer', token: 'test-token-123' });
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ roles: [] }),
      });

      await fetchRolesOverview();

      const [, options] = globalThis.fetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('ignores a leftover legacy sf_auth_token instead of sending it over the session bearer', async () => {
      setSessionCredentials({ mode: 'bearer', token: 'test-token-123' });
      localStorage.setItem('sf_auth_token', 'stale-legacy-token');
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ roles: [] }),
      });

      await fetchRolesOverview();

      const [, options] = globalThis.fetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('sends no Authorization header under the cookie session', async () => {
      setSessionCredentials({ mode: 'cookie', token: null, csrfToken: 'csrf-1' });
      localStorage.setItem('sf_auth_token', 'stale-legacy-token');
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ roles: [] }),
      });

      await fetchRolesOverview();

      const [, options] = globalThis.fetch.mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });

    it('sends no Authorization header when no token is stored', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ roles: [] }),
      });

      await fetchRolesOverview();

      const [, options] = globalThis.fetch.mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });

    it('never sends a Content-Type header (GET with no body, avoids an unnecessary CORS preflight)', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ roles: [] }),
      });

      await fetchRolesOverview();

      const [, options] = globalThis.fetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });
  });
});
