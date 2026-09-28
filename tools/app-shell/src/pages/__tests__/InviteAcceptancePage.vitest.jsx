import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, createMemoryAuthStorage } from '@etendosoftware/app-shell-core/auth';
import InviteAcceptancePage from '../InviteAcceptancePage.jsx';

/**
 * ETP-4960: this page renders the REAL `LoginStep` / `RegisterStep` from
 * `@etendosoftware/etendo-go-core`, not stand-ins.
 *
 * The page previously mocked the whole onboarding barrel with hand-written
 * forms whose submit handler always invoked `onAuthenticated`. That asserted
 * the page's reaction to a contract the real component was not honouring, and
 * it is how ETP-4958 — SSO login authenticating but never resuming the
 * invitation — reached a user with a green test suite.
 *
 * Only genuine external boundaries are stubbed: the i18n dictionaries and the
 * SSO provider SDK (there is no real Google Identity script in jsdom). `fetch`
 * is stubbed per test as before.
 */
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@etendosoftware/app-shell-core/i18n', () => ({
  useUI: () => (key) => key,
  // No setLocale → the shared auth steps skip the language selector.
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: null }),
}));

// Captures the credential callback the auth step hands to the provider SDK, so
// a test can complete an SSO sign-in without a real Google button.
let ssoHandlers = null;

vi.mock('@etendosoftware/etendo-go-core/onboarding/sso', () => ({
  getConfiguredSsoProviders: () => ['google'],
  renderSsoProviderButton: async (provider, container, handlers) => {
    ssoHandlers = handlers;
  },
  loadGoogleIdentityScript: async () => {},
  buildGoogleSsoPayload: (payload) => payload,
  readCookie: () => null,
}));

describe('InviteAcceptancePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    ssoHandlers = null;
    globalThis.localStorage.clear();
  });

  /**
   * Wrapped in a signed-out AuthProvider, which is the arrangement the app itself has: this
   * route lives inside AppShellRuntime (runtime-routes.jsx), and every case in this file models
   * a visitor arriving with no session.
   *
   * It also has to be here rather than left implicit. ETP-5202's session guard asks
   * /sws/neo/session who is signed in, and ETP-4576 made it ask unconditionally — there is no
   * localStorage token left to rule the question out. The mocks below are an ORDERED
   * `mockResolvedValueOnce` queue, so that extra request silently consumed the response meant
   * for the next step and every assertion after it slid one place. A settled 'anonymous' lets
   * the guard answer without a request, which is both the real behaviour and a stable queue.
   */
  function renderPage(initialEntry = '/invite?token=valid-token-123') {
    return render(
      <AuthProvider restoreSession={null} storage={createMemoryAuthStorage()}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/invite" element={<InviteAcceptancePage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
  }

  it('renders error state when token is missing', async () => {
    renderPage('/invite');

    await waitFor(() => {
      expect(screen.getByTestId('invite-error-state')).toBeInTheDocument();
      expect(screen.getByTestId('action-error-sign-in')).toBeInTheDocument();
    });
  });

  it('resolves existing-account branch and allows 1-click acceptance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'SENT',
          clientName: 'Acme Corp',
          email: 'existing.user@example.com',
          maskedEmail: 'e***r@example.com',
          branch: 'existing_account',
          accountExists: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'existing-session-token',
          account: { email: 'existing.user@example.com' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          message: 'Invitation accepted successfully',
          clientName: 'Acme Corp',
        }),
      });
    globalThis.fetch = fetchMock;

    const renderResult = renderPage('/invite?token=valid-token-123');

    const { container } = renderResult;
    await waitFor(() => {
      expect(screen.getByTestId('invite-shared-login')).toBeInTheDocument();
      expect(screen.getByTestId('action-login-submit')).toBeInTheDocument();
      expect(screen.getByDisplayValue('existing.user@example.com')).toBeInTheDocument();
    });

    fireEvent.change(container.querySelector('#login-password'), {
      target: { value: 'existing-password' },
    });
    fireEvent.click(screen.getByTestId('action-login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('invite-authenticated-step')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('action-accept-invitation'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        // ETP-4576 — logging in creates a SESSION now; the endpoint moved with it.
        expect.stringContaining('/sws/go/session'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'existing.user@example.com',
            password: 'existing-password',
          }),
        })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/sws/go/company-invitations/accept'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer existing-session-token', 'Accept-Language': 'es_ES' }),
          body: JSON.stringify({ token: 'valid-token-123' }),
        })
      );
      expect(screen.getByTestId('invite-success-state')).toBeInTheDocument();
      expect(screen.getByTestId('action-go-to-app')).toBeInTheDocument();
    });
  });

  // ETP-4958 regression: SSO authenticated the user but never returned control
  // to this page, so the acceptance step was never reached and the invitation
  // token stayed unconsumed. With the shared LoginStep mocked away, no test in
  // either repo exercised this path.
  it('resumes the invitation after an SSO login on the existing-account branch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'SENT',
          clientName: 'Acme Corp',
          email: 'existing.user@example.com',
          maskedEmail: 'e***r@example.com',
          branch: 'existing_account',
          accountExists: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'sso-session-token',
          account: { email: 'existing.user@example.com' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          message: 'Invitation accepted successfully',
          clientName: 'Acme Corp',
        }),
      });
    globalThis.fetch = fetchMock;

    renderPage('/invite?token=valid-token-789');

    await waitFor(() => {
      expect(screen.getByTestId('invite-shared-login')).toBeInTheDocument();
    });

    // Complete a successful SSO sign-in through the callback the real LoginStep
    // registered with the provider SDK.
    await waitFor(() => expect(ssoHandlers).not.toBeNull());
    ssoHandlers.onCredential('google', { credential: 'google-jwt' });

    // The page must advance to the acceptance step instead of leaving the user
    // on the login form.
    await waitFor(() => {
      expect(screen.getByTestId('invite-authenticated-step')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('action-login-submit')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('action-accept-invitation'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        // ETP-4576 — same move for the SSO branch: /sws/go/session/sso/<provider>.
        expect.stringContaining('/sws/go/session/sso/google'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ credential: 'google-jwt' }),
        })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/sws/go/company-invitations/accept'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer sso-session-token', 'Accept-Language': 'es_ES' }),
          body: JSON.stringify({ token: 'valid-token-789' }),
        })
      );
      expect(screen.getByTestId('invite-success-state')).toBeInTheDocument();
    });
  });

  it('resolves registration_required branch and creates account then accepts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'SENT',
          clientName: 'Acme Corp',
          email: 'new.user@example.com',
          maskedEmail: 'n***r@example.com',
          branch: 'registration_required',
          accountExists: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          token: 'new-session-token',
          account: { id: 'acc-1', email: 'new.user@example.com', name: 'New User' },
          clientName: 'Acme Corp',
        }),
      });
    globalThis.fetch = fetchMock;

    const { container } = renderPage('/invite?token=valid-token-456');

    await waitFor(() => {
      expect(screen.getByTestId('invite-new-account')).toBeInTheDocument();
      expect(container.querySelector('#reg-email')).toHaveValue('new.user@example.com');
      expect(screen.getByTestId('action-register-submit')).toBeInTheDocument();
    });

    fireEvent.change(container.querySelector('#reg-name'), {
      target: { value: 'New User' },
    });
    fireEvent.change(container.querySelector('#reg-password'), {
      target: { value: 'Str0ng!Pass123' },
    });
    fireEvent.click(screen.getByTestId('action-register-submit'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/sws/go/company-invitations/register-and-accept'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            token: 'valid-token-456',
            name: 'New User',
            password: 'Str0ng!Pass123',
          }),
        })
      );
      expect(screen.getByTestId('invite-success-state')).toBeInTheDocument();
    });
  });

  // ETP-5488 — register-and-accept creates the account but opens no session, so the new invitee
  // used to land on the success screen signed out: "Entrar en <empresa>" returned before sending
  // a single request and showed "No hemos podido abrir esa empresa", roles or not. The page now
  // signs the new account in (POST /sws/go/session, the cookie session) right after registering,
  // so entering the company asks the server for the environments like any signed-in user.
  it('signs the new account in after registering so entering the company reaches the server', async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = String(url);
      calls.push({ path, method: options.method || 'GET', body: options.body });
      const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
      if (path.includes('/sws/go/company-invitations/register-and-accept')) {
        return json({ status: 'success', token: 'legacy-token', clientName: 'Acme Corp',
          account: { id: 'acc-1', email: 'new.user@example.com', name: 'New User' } });
      }
      if (path.includes('/sws/go/company-invitations')) {
        return json({ status: 'SENT', clientName: 'Acme Corp', email: 'new.user@example.com',
          maskedEmail: 'n***r@example.com', branch: 'registration_required', accountExists: false });
      }
      if (path.endsWith('/sws/go/session') && options.method === 'POST') {
        return json({ status: 'success', csrfToken: 'csrf-new-user',
          account: { id: 'acc-1', email: 'new.user@example.com', name: 'New User' } });
      }
      if (path.includes('/sws/go/environments')) return json({ environments: [] });
      return { ok: false, status: 401, json: async () => ({}), text: async () => '' };
    });
    globalThis.fetch = fetchMock;

    const { container } = renderPage('/invite?token=valid-token-789');
    await waitFor(() => expect(screen.getByTestId('action-register-submit')).toBeInTheDocument());
    fireEvent.change(container.querySelector('#reg-name'), { target: { value: 'New User' } });
    fireEvent.change(container.querySelector('#reg-password'), { target: { value: 'Str0ng!Pass123' } });
    fireEvent.click(screen.getByTestId('action-register-submit'));
    await waitFor(() => expect(screen.getByTestId('invite-success-state')).toBeInTheDocument());

    const login = calls.find((c) => c.path.endsWith('/sws/go/session') && c.method === 'POST');
    expect(login).toBeTruthy();
    expect(JSON.parse(login.body)).toEqual({ email: 'new.user@example.com', password: 'Str0ng!Pass123' });

    fireEvent.click(screen.getByTestId('action-go-to-app'));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/sws/go/environments'))).toBe(true));
  });

  it('renders already accepted state idempotently', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ACCEPTED',
        clientName: 'Acme Corp',
        branch: 'accepted',
      }),
    });
    globalThis.fetch = fetchMock;

    renderPage('/invite?token=already-accepted-token');

    await waitFor(() => {
      expect(screen.getByTestId('invite-success-state')).toBeInTheDocument();
      expect(screen.getByText('invitePageAlreadyAcceptedTitle')).toBeInTheDocument();
    });
  });

  it('renders invalid or expired error state when backend rejects token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: true,
        code: 'EXPIRED_TOKEN',
        message: 'This invitation link has expired',
      }),
    });
    globalThis.fetch = fetchMock;

    renderPage('/invite?token=expired-token');

    await waitFor(() => {
      expect(screen.getByTestId('invite-error-state')).toBeInTheDocument();
      expect(screen.getByText('invitePageInvalidTitle')).toBeInTheDocument();
    });
  });
});
