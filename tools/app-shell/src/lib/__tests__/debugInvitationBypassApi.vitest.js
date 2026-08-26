import { forceAcceptInvitation, forceInvitationStatus } from '../debugInvitationBypassApi.js';

// ETP-4830 (item #4) — debugInvitationBypassApi.js wraps the dev/QA-only `SFDebugInvitationBypass`
// webhook using the exact same `fetchNeoWebhookJson` mechanics as `userRoleAssignmentsApi.js`
// (same-origin GET, `{result: "<json-string>"}` unwrap, non-JSON-200 rejection, `data.error`
// rejection — see that module's own vitest suite for that shared-mechanics coverage). This file
// only has to prove its own request-shape building and the `success:false` domain-rejection throw.
describe('debugInvitationBypassApi', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('forceAcceptInvitation', () => {
    it('builds the debuginvitationbypass URL with Action=forceAccept and Email', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, email: 'user@example.com', accountId: 'acct-1' }),
      });

      await forceAcceptInvitation({ email: 'user@example.com' });

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('/sws/neo/debuginvitationbypass?');
      expect(url).toContain('Action=forceAccept');
      expect(url).toContain('Email=user%40example.com');
    });

    it('omits AdUserId/Name query params when not provided', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
      });

      await forceAcceptInvitation({ email: 'user@example.com' });

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).not.toContain('AdUserId');
      expect(url).not.toContain('Name=');
    });

    it('includes AdUserId and Name when provided', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
      });

      await forceAcceptInvitation({ adUserId: 'user-1', name: 'QA Tester' });

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('AdUserId=user-1');
      expect(url).toContain('Name=QA+Tester');
    });

    it('resolves with the full success payload', async () => {
      const success = {
        success: true, email: 'user@example.com', accountId: 'acct-1',
        accountCreated: true, temporaryPassword: 'Aa1!xyz', invitationId: 'inv-1',
        invitationStatus: 'ACCEPTED',
      };
      globalThis.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(success) });

      await expect(forceAcceptInvitation({ email: 'user@example.com' })).resolves.toEqual(success);
    });

    it('throws new Error(message) on an HTTP-200 domain rejection ({success:false, message})', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: false, message: 'Email is required' }),
      });

      await expect(forceAcceptInvitation({})).rejects.toThrow('Email is required');
    });

    it('falls back to a generic rejection message when success:false has no message field', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: false }),
      });

      await expect(forceAcceptInvitation({ email: 'user@example.com' }))
        .rejects.toThrow('SFDebugInvitationBypass rejected the request');
    });
  });

  describe('forceInvitationStatus', () => {
    it('builds the debuginvitationbypass URL with Action=forceStatus, Status, and Email', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, status: 'SENT' }),
      });

      await forceInvitationStatus({ email: 'user@example.com', status: 'SENT' });

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('Action=forceStatus');
      expect(url).toContain('Status=SENT');
      expect(url).toContain('Email=user%40example.com');
    });

    it('uses InvitationId instead of Email when provided', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
      });

      await forceInvitationStatus({ invitationId: 'inv-1', status: 'EXPIRED' });

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('InvitationId=inv-1');
      expect(url).not.toContain('Email=');
    });

    it('throws new Error(message) on an HTTP-200 domain rejection', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: false, message: 'No matching invitation found' }),
      });

      await expect(forceInvitationStatus({ email: 'user@example.com', status: 'SENT' }))
        .rejects.toThrow('No matching invitation found');
    });
  });
});
