import { resendInvitation } from '../resendInvitationApi.js';

// ETP-4830 (item #2) — resendInvitationApi.js wraps the admin-triggered `SFResendInvitation`
// webhook using the exact same `fetchNeoWebhookJson` mechanics as `debugInvitationBypassApi.js`
// (same-origin GET, non-JSON-200 rejection — see that module's own vitest suite for that shared-
// mechanics coverage). Responses are mocked wrapped in `{result: "<json-string>"}`, the actual
// wire shape `SFResendInvitation.get()` produces (`responseVars.put("result", ...)`) — unlike
// `debugInvitationBypassApi.vitest.js`'s mocks, this domain response's own top-level key is
// literally named `error` (a boolean, `CompanyInvitationService#errorResponse`'s convention),
// which collides with `fetchNeoWebhookJson`'s own reserved top-level `data.error` handling if
// mocked unwrapped — the `{result: ...}` envelope is what keeps that collision from ever
// happening on the real wire.
describe('resendInvitationApi', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function mockResult(payload) {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ result: JSON.stringify(payload) }),
    });
  }

  it('builds the resendinvitation URL with AdUserId', async () => {
    mockResult({ status: 'success', invitation: { status: 'SENT' } });

    await resendInvitation('user-1');

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/sws/neo/resendinvitation?');
    expect(url).toContain('AdUserId=user-1');
  });

  it('resolves with the full success payload', async () => {
    const success = {
      status: 'success',
      invitation: { id: 'inv-2', email: 'user@example.com', status: 'SENT', expiresAt: '2026-09-01T00:00:00Z' },
    };
    mockResult(success);

    await expect(resendInvitation('user-1')).resolves.toEqual(success);
  });

  it('throws new Error(message) on an HTTP-200 domain rejection ({error:true, message})', async () => {
    mockResult({ error: true, code: 'INVITATION_NOT_RESENDABLE', message: "Invitation status 'REVOKED' cannot be resent" });

    await expect(resendInvitation('user-1')).rejects.toThrow("Invitation status 'REVOKED' cannot be resent");
  });

  it('falls back to a generic rejection message when error:true has no message field', async () => {
    mockResult({ error: true });

    await expect(resendInvitation('user-1')).rejects.toThrow('SFResendInvitation rejected the request');
  });
});
