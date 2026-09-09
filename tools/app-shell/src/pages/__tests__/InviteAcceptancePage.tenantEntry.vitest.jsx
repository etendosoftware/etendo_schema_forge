import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import enUS from '@/locales/en_US.json';
import InviteAcceptancePage from '../InviteAcceptancePage.jsx';

/**
 * ETP-5202 phase 2 — reaching the tenant that invited you.
 *
 * Reported by the user: "al 'ir a la aplicación' no me movió al tenant que me acaba de dar
 * acceso". `navigate('/')` lands wherever the browser was already pointing — the tenant you
 * were in before, or the onboarding redirect when there was no tenant session at all. Never
 * the company you just joined, and nothing on screen said so.
 *
 * `useEnvironmentSwitch` is stubbed here because switching tenants is a hard page load; its own
 * contract (including the roleless refusal that produces the `false` these tests react to) is
 * covered directly in `src/hooks/__tests__/useEnvironmentSwitch.vitest.jsx`.
 *
 * As in the sibling guard file, `useUI` resolves against the REAL en_US dictionary: the button
 * copy is assembled with `{companyName}` substitution, and a key-echoing mock would make every
 * "does it name the right company?" assertion pass vacuously.
 */
const LABELS = enUS.genericLabels;

vi.mock('@/i18n', () => ({
  useUI: () => (key) => LABELS[key] ?? key,
}));

vi.mock('@etendosoftware/app-shell-core/i18n', () => ({
  useUI: () => (key) => LABELS[key] ?? key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: null }),
}));

vi.mock('@etendosoftware/etendo-go-core/onboarding/sso', () => ({
  getConfiguredSsoProviders: () => [],
  renderSsoProviderButton: async () => {},
  loadGoogleIdentityScript: async () => {},
  buildGoogleSsoPayload: (payload) => payload,
  readCookie: () => null,
}));

// Stable identities: `useApiFetch` memoizes on the logout identity, and a hook handing back a
// fresh function per render would rebuild `apiFetch` every render, re-firing the guard effect
// that lists it as a dependency.
const logoutSpy = vi.fn();
vi.mock('@/auth/useLogout.js', () => ({
  useLogout: () => logoutSpy,
}));

const enterByClientName = vi.fn();
vi.mock('@/hooks/useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: () => ({
    environments: [],
    switchTo: vi.fn(),
    enterByClientName,
    switching: null,
    currentClientId: undefined,
  }),
}));

const INVITED_EMAIL = 'invitee@example.com';
const INVITING_COMPANY = 'Acme Corp';
const PREVIOUS_COMPANY = 'Previous Corp';

const jsonOk = (body) => ({ ok: true, status: 200, json: async () => body });
const jsonFail = (status, body = {}) => ({ ok: false, status, json: async () => body });

const existingBranch = {
  status: 'SENT',
  clientName: INVITING_COMPANY,
  email: INVITED_EMAIL,
  maskedEmail: 'i***e@example.com',
  branch: 'existing_account',
  accountExists: true,
};

const acceptedBranch = {
  status: 'ACCEPTED',
  clientName: INVITING_COMPANY,
  branch: 'accepted',
};

function installFetch({ resolve: resolveResponse }) {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('/sws/go/company-invitations/resolve')) return resolveResponse;
    if (String(url).includes('/sws/go/company-invitations/accept')) {
      return jsonOk({ status: 'success', clientName: INVITING_COMPANY });
    }
    if (String(url).includes('/sws/neo/session')) return jsonOk({ accountEmail: INVITED_EMAIL });
    return jsonFail(404);
  });
}

function renderPage(initialEntry = '/invite?token=t') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/invite" element={<InviteAcceptancePage />} />
        {/* A real destination rather than a mocked `useNavigate`, so "stay here" is asserted
            by where the user ends up, not by a spy on the router. */}
        <Route path="/" element={<div data-testid="app-root" />} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * Reaches the success screen the way a signed-in invitee does: the phase-2 shortcut skips the
 * login step, leaving one click to accept. The success screen is reached through the real
 * acceptance call rather than by seeding state, so the storage these tests read is the storage
 * the flow actually leaves behind.
 */
async function acceptAsSignedInInvitee() {
  installFetch({ resolve: jsonOk(existingBranch) });
  globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');
  globalThis.localStorage.setItem('sf_platform_token', 'platform-jwt');
  globalThis.localStorage.setItem('sf_auth_client_name', PREVIOUS_COMPANY);

  renderPage('/invite?token=accept-me');

  fireEvent.click(await screen.findByTestId('action-accept-invitation'));
  await screen.findByTestId('invite-success-state');
}

describe('InviteAcceptancePage — ETP-5202 entering the inviting tenant', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    logoutSpy.mockClear();
    enterByClientName.mockReset();
    enterByClientName.mockResolvedValue(true);
    globalThis.localStorage.clear();
  });

  // 6 — Joining a company from an open session used to be silent: press "go to app", land back
  // where you were, nothing saying you now belong somewhere else. Both buttons must NAME their
  // tenant, or the choice is unreadable.
  it('offers to enter the inviting company and to stay in the current one, naming both', async () => {
    await acceptAsSignedInInvitee();

    const enter = screen.getByTestId('action-go-to-app');
    const stay = screen.getByTestId('action-stay-in-current');
    expect(enter).toHaveTextContent(INVITING_COMPANY);
    expect(stay).toHaveTextContent(PREVIOUS_COMPANY);
    // The two must not be confusable: neither button may name the other's tenant.
    expect(enter).not.toHaveTextContent(PREVIOUS_COMPANY);
    expect(stay).not.toHaveTextContent(INVITING_COMPANY);

    fireEvent.click(enter);

    await waitFor(() => {
      expect(enterByClientName).toHaveBeenCalledWith(INVITING_COMPANY);
    });
  });

  it('keeps the user where they are when they choose to stay', async () => {
    await acceptAsSignedInInvitee();

    fireEvent.click(screen.getByTestId('action-stay-in-current'));

    await screen.findByTestId('app-root');
    expect(enterByClientName).not.toHaveBeenCalled();
  });

  // Switching is a hard reload; the button must not stay clickable while it is in flight.
  it('disables the enter button while the switch is in flight', async () => {
    let releaseEnter;
    enterByClientName.mockImplementation(() => new Promise((resolve) => { releaseEnter = resolve; }));

    await acceptAsSignedInInvitee();
    fireEvent.click(screen.getByTestId('action-go-to-app'));

    await waitFor(() => {
      expect(screen.getByTestId('action-go-to-app')).toBeDisabled();
    });
    releaseEnter(true);
  });

  // 7 — With no tenant to go back to, "stay in <company>" would name nothing. It must not be
  // rendered at all rather than rendered empty.
  it('does not offer to stay when no tenant session is open', async () => {
    installFetch({ resolve: jsonOk(acceptedBranch) });

    renderPage('/invite?token=already-accepted');

    await screen.findByTestId('invite-success-state');
    expect(screen.queryByTestId('action-stay-in-current')).not.toBeInTheDocument();
  });

  /**
   * The offer to stay is derived from storage on every render, not from a flag the guard effect
   * sets. It used to be the latter, and the `accepted` branch exits that effect at its first
   * guard — so a signed-in user reopening an invitation they had already accepted was silently
   * denied the choice the freshly-accepted screen gives them, same user, same browser, same
   * session. Deriving it from what actually decides the question — is there a tenant to go back
   * to? — is what makes the two screens agree.
   */
  describe('the offer to stay, on the already-accepted screen', () => {
    it('is present and names the current company when a tenant session is open', async () => {
      installFetch({ resolve: jsonOk(acceptedBranch) });
      globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');
      globalThis.localStorage.setItem('sf_platform_token', 'platform-jwt');
      globalThis.localStorage.setItem('sf_auth_client_name', PREVIOUS_COMPANY);

      renderPage('/invite?token=already-accepted-signed-in');

      await screen.findByTestId('invite-success-state');
      const stay = screen.getByTestId('action-stay-in-current');
      expect(stay).toHaveTextContent(PREVIOUS_COMPANY);
      expect(stay).not.toHaveTextContent(INVITING_COMPANY);

      fireEvent.click(stay);
      await screen.findByTestId('app-root');
      expect(enterByClientName).not.toHaveBeenCalled();
    });

    // Someone who just registered through an invitation holds a platform account but no tenant
    // session, so there is nowhere to stay — the platform token alone must not conjure the
    // offer. `sf_auth_token` is the key that means "a tenant is open".
    it('is absent with a platform token but no tenant session', async () => {
      installFetch({ resolve: jsonOk(acceptedBranch) });
      globalThis.localStorage.setItem('sf_platform_token', 'platform-jwt');
      globalThis.localStorage.setItem('sf_auth_client_name', PREVIOUS_COMPANY);

      renderPage('/invite?token=platform-only');

      await screen.findByTestId('invite-success-state');
      expect(screen.queryByTestId('action-stay-in-current')).not.toBeInTheDocument();
    });

    // The mirror case: a tenant token whose company name was never stored would render a
    // button naming nobody.
    it('is absent with a tenant session but no stored company name', async () => {
      installFetch({ resolve: jsonOk(acceptedBranch) });
      globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');

      renderPage('/invite?token=nameless-tenant');

      await screen.findByTestId('invite-success-state');
      expect(screen.queryByTestId('action-stay-in-current')).not.toBeInTheDocument();
    });
  });

  // 9 — The already-accepted screen is the one a user reaches by reopening the email link, and
  // it is precisely where "I have access, now how do I get in?" is asked.
  it('offers to enter the company from the already-accepted screen too', async () => {
    installFetch({ resolve: jsonOk(acceptedBranch) });

    renderPage('/invite?token=already-accepted');

    await screen.findByTestId('invite-success-state');
    const enter = screen.getByTestId('action-go-to-app');
    expect(enter).toHaveTextContent(INVITING_COMPANY);

    fireEvent.click(enter);

    await waitFor(() => {
      expect(enterByClientName).toHaveBeenCalledWith(INVITING_COMPANY);
    });
  });

  // 8 — A failure is never a dead end. `enterByClientName` answers false both when the
  // environment cannot be reached and when the invited user has no role in it yet (ETP-4830:
  // an admin-created user has zero roles until somebody assigns one), so the copy has to
  // mention the missing role and there must still be a way into the app.
  it('explains the failure and still offers a way into the app, with no tenant to return to', async () => {
    enterByClientName.mockResolvedValue(false);
    installFetch({ resolve: jsonOk(acceptedBranch) });

    renderPage('/invite?token=roleless');

    await screen.findByTestId('invite-success-state');
    fireEvent.click(screen.getByTestId('action-go-to-app'));

    const failure = await screen.findByTestId('invite-enter-error');
    expect(failure).toHaveTextContent(LABELS.invitePageEnterFailed);
    // No tenant to return to, so the escape route is the explicit fallback button.
    const fallback = screen.getByTestId('action-go-to-app-fallback');
    fireEvent.click(fallback);
    await screen.findByTestId('app-root');
  });

  it('explains the failure and leaves the stay button as the escape route, with a tenant to return to', async () => {
    enterByClientName.mockResolvedValue(false);
    await acceptAsSignedInInvitee();

    fireEvent.click(screen.getByTestId('action-go-to-app'));

    await screen.findByTestId('invite-enter-error');
    // "Stay in <previous company>" already IS a way into the app, so a second fallback button
    // beside it would be two buttons doing the same thing.
    expect(screen.queryByTestId('action-go-to-app-fallback')).not.toBeInTheDocument();
    const stay = screen.getByTestId('action-stay-in-current');
    expect(stay).toBeInTheDocument();

    fireEvent.click(stay);
    await screen.findByTestId('app-root');
  });

  // A retry has to be possible: the role may have been assigned in the meantime.
  it('re-enables the enter button after a failure', async () => {
    enterByClientName.mockResolvedValue(false);
    await acceptAsSignedInInvitee();

    fireEvent.click(screen.getByTestId('action-go-to-app'));
    await screen.findByTestId('invite-enter-error');

    expect(screen.getByTestId('action-go-to-app')).not.toBeDisabled();
    enterByClientName.mockResolvedValue(true);
    fireEvent.click(screen.getByTestId('action-go-to-app'));

    await waitFor(() => {
      expect(enterByClientName).toHaveBeenCalledTimes(2);
    });
  });
});
