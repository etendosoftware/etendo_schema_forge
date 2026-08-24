import { fetchUserRoleAssignments, saveUserRoleAssignments } from '../userRoleAssignmentsApi.js';

// ETP-4906 — userRoleAssignmentsApi.js wraps two NEO Headless endpoints
// (`SFUserRoleAssignments` read, `SFAssignUserRoles` write) using the exact same
// `fetchNeoJson` mechanics as `rolesApi.js`'s `fetchRolesOverview` (see that file's
// own vitest suite, rolesApi.vitest.js, which this mirrors) — same-origin GET,
// `{result: "<json-string>"}` unwrap, non-JSON-200 rejection, `data.error` rejection —
// plus this module's own extra fallback branch (`assignments`/`templateRoleIds`/
// `success` keys instead of `roles`) and saveUserRoleAssignments' domain-rejection
// throw on `{success: false, message}`.
describe('userRoleAssignmentsApi', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('fetchUserRoleAssignments — request shape', () => {
    it('requests the userroleassignments endpoint with no query string in bulk mode', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ assignments: {} }),
      });

      await fetchUserRoleAssignments();

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('/sws/neo/userroleassignments');
      expect(url).not.toContain('?');
    });

    it('appends UserId=<id> in single-user mode', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ userId: 'user-1', templateRoleIds: [] }),
      });

      await fetchUserRoleAssignments('user-1');

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('/sws/neo/userroleassignments?UserId=user-1');
    });

    it('wires the Authorization header from sf_auth_token when present', async () => {
      localStorage.setItem('sf_auth_token', 'tok-123');
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ assignments: {} }),
      });

      await fetchUserRoleAssignments();

      const [, options] = globalThis.fetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer tok-123');
    });

    it('sends no Authorization header when no token is stored', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ assignments: {} }),
      });

      await fetchUserRoleAssignments();

      const [, options] = globalThis.fetch.mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });

    it('never sends a Content-Type header', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ assignments: {} }),
      });

      await fetchUserRoleAssignments();

      const [, options] = globalThis.fetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('fetchUserRoleAssignments — response shapes', () => {
    it('returns the bulk assignments payload directly when the body already carries it', async () => {
      const raw = { assignments: { 'user-1': ['role-fin', 'role-sales'] } };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(raw),
      });

      await expect(fetchUserRoleAssignments()).resolves.toEqual(raw);
    });

    it('returns the single-user payload directly when the body already carries templateRoleIds', async () => {
      const raw = { userId: 'user-1', templateRoleIds: ['role-fin'] };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(raw),
      });

      await expect(fetchUserRoleAssignments('user-1')).resolves.toEqual(raw);
    });

    it('parses data.result when it is itself a JSON string', async () => {
      const inner = { assignments: { 'user-2': [] } };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: JSON.stringify(inner) }),
      });

      await expect(fetchUserRoleAssignments()).resolves.toEqual(inner);
    });

    it('returns data.result directly when it is already an object', async () => {
      const inner = { userId: 'u1', templateRoleIds: [] };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: inner }),
      });

      await expect(fetchUserRoleAssignments('u1')).resolves.toEqual(inner);
    });

    it('resolves to the "deny silently" empty bulk shape without throwing', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ assignments: {} }),
      });

      await expect(fetchUserRoleAssignments()).resolves.toEqual({ assignments: {} });
    });

    it('resolves to the "deny silently" empty single-user shape without throwing', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ userId: 'other-tenant-user', templateRoleIds: [] }),
      });

      await expect(fetchUserRoleAssignments('other-tenant-user')).resolves.toEqual({
        userId: 'other-tenant-user',
        templateRoleIds: [],
      });
    });

    it('rejects when the 200 response body is not valid JSON', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<!doctype html><html><body>App</body></html>',
      });

      await expect(fetchUserRoleAssignments()).rejects.toThrow(/non-JSON/);
    });

    it('rejects with data.error when the backend returns an explicit error field on a 200', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ error: 'access denied' }),
      });

      await expect(fetchUserRoleAssignments()).rejects.toThrow('access denied');
    });

    it('rejects with an "unexpected shape" message when the body has none of the recognized keys', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ somethingElse: true }),
      });

      await expect(fetchUserRoleAssignments()).rejects.toThrow(/unexpected shape/);
    });

    it('rejects using data.error when the response is not ok', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: 'Forbidden' }),
      });

      await expect(fetchUserRoleAssignments()).rejects.toThrow('Forbidden');
    });

    it('falls back to a generic "SFUserRoleAssignments error: <status>" message when not ok with no error/message field', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({}),
      });

      await expect(fetchUserRoleAssignments()).rejects.toThrow('SFUserRoleAssignments error: 500');
    });
  });

  describe('saveUserRoleAssignments', () => {
    it('builds the assignuserroles URL with UserId and a comma-joined TemplateRoleIds', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          success: true, userId: 'user-1', personalRoleId: 'p-1',
          templateRoleIds: ['role-fin', 'role-sales'], added: 2, removed: 0,
        }),
      });

      await saveUserRoleAssignments('user-1', ['role-fin', 'role-sales']);

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('/sws/neo/assignuserroles?');
      expect(url).toContain('UserId=user-1');
      expect(url).toContain('TemplateRoleIds=role-fin%2Crole-sales');
    });

    it('sends an empty TemplateRoleIds value for an empty desired set (clears all templates)', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          success: true, userId: 'user-1', personalRoleId: 'p-1',
          templateRoleIds: [], added: 0, removed: 2,
        }),
      });

      await saveUserRoleAssignments('user-1', []);

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('TemplateRoleIds=');
      expect(url).not.toContain('TemplateRoleIds=undefined');
    });

    it('treats a nullish templateRoleIds argument the same as an empty array', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          success: true, userId: 'user-1', personalRoleId: 'p-1',
          templateRoleIds: [], added: 0, removed: 0,
        }),
      });

      await saveUserRoleAssignments('user-1', undefined);

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('TemplateRoleIds=');
    });

    it('resolves with the full success payload on success', async () => {
      const success = {
        success: true, userId: 'user-1', personalRoleId: 'p-1',
        templateRoleIds: ['role-fin'], added: 1, removed: 0,
      };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(success),
      });

      await expect(saveUserRoleAssignments('user-1', ['role-fin'])).resolves.toEqual(success);
    });

    it('throws new Error(message) on an HTTP-200 domain rejection ({success:false, message})', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: false, message: 'Admin role cannot be assigned' }),
      });

      await expect(saveUserRoleAssignments('user-1', ['admin-role']))
        .rejects.toThrow('Admin role cannot be assigned');
    });

    it('falls back to a generic rejection message when success:false has no message field', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: false }),
      });

      await expect(saveUserRoleAssignments('user-1', []))
        .rejects.toThrow('SFAssignUserRoles rejected the request');
    });

    it('propagates a transport-level rejection (non-2xx HTTP) as a distinct failure from a domain rejection', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ message: 'Internal error' }),
      });

      await expect(saveUserRoleAssignments('user-1', ['role-fin'])).rejects.toThrow('Internal error');
    });
  });
});
