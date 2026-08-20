import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InviteAcceptancePage from '../InviteAcceptancePage.jsx';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@etendosoftware/etendo-go-core/onboarding', () => ({
  AuthShell: ({ children }) => <div data-testid="auth-shell">{children}</div>,
  LoginStep: ({ initialEmail, onAuthenticated }) => (
    <form data-testid="invite-existing-login-form" onSubmit={(event) => {
      event.preventDefault();
      globalThis.fetch('/sws/go/login', {
        method: 'POST',
        body: JSON.stringify({ email: initialEmail, password: event.currentTarget.querySelector('#login-password').value }),
      }).then((response) => response.json()).then((data) => {
        globalThis.localStorage.setItem('sf_platform_token', data.token);
        onAuthenticated(data);
      });
    }}>
      <input id="login-email" value={initialEmail} readOnly data-testid="invite-existing-email" />
      <input id="login-password" name="password" type="password" data-testid="invite-existing-password" />
      <button type="submit" data-testid="action-invite-login">Log in</button>
    </form>
  ),
  RegisterStep: ({ initialEmail, registerHandler, onRegistered }) => (
    <form data-testid="invite-register-form" onSubmit={async (event) => {
      event.preventDefault();
      const data = await registerHandler({
        name: event.currentTarget.querySelector('#reg-name').value,
        email: initialEmail,
        password: event.currentTarget.querySelector('#reg-password').value,
      });
      globalThis.localStorage.setItem('sf_platform_token', data.token);
      await onRegistered(data.token, data.account);
    }}>
      <input id="reg-name" data-testid="invite-name" />
      <input id="reg-email" value={initialEmail} readOnly data-testid="invite-email" />
      <input id="reg-password" type="password" data-testid="invite-password" />
      <button type="submit" data-testid="action-register-submit">Create account</button>
    </form>
  ),
}));

describe('InviteAcceptancePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function renderPage(initialEntry = '/invite?token=valid-token-123') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/invite" element={<InviteAcceptancePage />} />
        </Routes>
      </MemoryRouter>
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

    renderPage('/invite?token=valid-token-123');

    await waitFor(() => {
      expect(screen.getByTestId('invite-shared-login')).toBeInTheDocument();
      expect(screen.getByTestId('action-invite-login')).toBeInTheDocument();
      expect(screen.getByDisplayValue('existing.user@example.com')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('invite-existing-password'), {
      target: { value: 'existing-password' },
    });
    fireEvent.click(screen.getByTestId('action-invite-login'));

    await waitFor(() => {
      expect(screen.getByTestId('invite-authenticated-step')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('action-accept-invitation'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/sws/go/login'),
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
          headers: expect.objectContaining({ Authorization: 'Bearer existing-session-token' }),
          body: JSON.stringify({ token: 'valid-token-123' }),
        })
      );
      expect(screen.getByTestId('invite-success-state')).toBeInTheDocument();
      expect(screen.getByTestId('action-go-to-app')).toBeInTheDocument();
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

    renderPage('/invite?token=valid-token-456');

    await waitFor(() => {
      expect(screen.getByTestId('invite-new-account')).toBeInTheDocument();
      expect(screen.getByTestId('invite-email')).toHaveValue('new.user@example.com');
      expect(screen.getByTestId('action-register-submit')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('invite-name'), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByTestId('invite-password'), {
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
