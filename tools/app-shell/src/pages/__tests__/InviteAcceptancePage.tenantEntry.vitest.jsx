import { render, screen, fireEvent, waitFor, act, configure } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import enUS from '@/locales/en_US.json';
import InviteAcceptancePage from '../InviteAcceptancePage.jsx';

/**
 * The invitation flows chain several awaited steps (resolve → identity check → accept), and RTL's
 * 1s default is measured against a machine running the whole suite in parallel — not against this
 * file alone. A step that legitimately takes longer under load is a slow test, not a failing one.
 */
configure({ asyncUtilTimeout: 5000 });


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
 *
 * ETP-4576 — "the company you are in right now" is no longer a pair of localStorage reads.
 * `sf_auth_token` and `sf_auth_client_name` are legacy auth keys: the cookie migration stopped
 * writing them and `purgeLegacyAuthStorage` deletes them, so seeding either one here would
 * assert nothing. The page now remembers a clientId (`sf_last_environment`, written by
 * `rememberEnvironment` on every switch and deliberately NOT a legacy auth key) and resolves
 * its name against `GET /sws/go/environments`, which rides the session cookie. That splits the
 * old single "is there a token?" question into three independently testable ones — nothing
 * remembered, nothing to ask (no session), and remembered-but-unknown — and the third could not
 * be expressed at all under the storage model.
 *
 * Both halves are stubbed at the `fetch` boundary rather than by mocking the core
 * `onboarding/api` module, matching the sibling files: the request shape and the
 * `{ environments: [...] }` envelope are part of what these tests pin.
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

// Spelled out rather than imported from the core package: the literal IS the contract. The key
// has to survive `purgeLegacyAuthStorage` and stay byte-identical to what `rememberEnvironment`
// writes, and importing the constant would make a rename invisible on both sides at once.
const LAST_ENVIRONMENT_KEY = 'sf_last_environment';
const PREVIOUS_CLIENT_ID = 'CLIENT-PREVIOUS';

// Two entries, the wanted one second: the page must pick by `clientId`, not take the head of
// the list. A single-entry fixture would pass either way.
const ENVIRONMENTS = [
  { clientId: 'CLIENT-OTHER', clientName: 'Other Corp', adminUserId: 'USER-OTHER' },
  { clientId: PREVIOUS_CLIENT_ID, clientName: PREVIOUS_COMPANY, adminUserId: 'USER-PREVIOUS' },
];

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

/**
 * `environments` defaults to a healthy, account-scoped list, so what decides whether the offer
 * to stay appears is the one thing that decides it in the browser: whether a tenant was
 * remembered. Tests that need the other half — a visitor the server will not hand a list to —
 * pass a rejection in.
 */
function installFetch({ resolve: resolveResponse, environments = jsonOk({ environments: ENVIRONMENTS }) }) {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('/sws/go/company-invitations/resolve')) return resolveResponse;
    if (String(url).includes('/sws/go/company-invitations/accept')) {
      return jsonOk({ status: 'success', clientName: INVITING_COMPANY });
    }
    if (String(url).includes('/sws/go/environments')) return environments;
    if (String(url).includes('/sws/neo/session')) return jsonOk({ accountEmail: INVITED_EMAIL });
    return jsonFail(404);
  });
}

// The clientId `rememberEnvironment` leaves behind after entering a tenant — the only trace of
// "where I was" that survives the legacy-key purge.
function rememberPreviousTenant(clientId = PREVIOUS_CLIENT_ID) {
  globalThis.localStorage.setItem(LAST_ENVIRONMENT_KEY, clientId);
}

/**
 * The tenant name is resolved by an async effect, so "the button is absent" only means anything
 * once that effect has had its turn — `queryByTestId` fired the moment the success screen
 * renders passes even when the button is one microtask away from appearing. A macrotask turn
 * drains the whole pending microtask queue (the fetch stub, the JSON read, the state update),
 * which a bare `await act(async () => {})` does not promise to do for a chain of that depth.
 */
function settleTenantLookup() {
  return act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
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
 * acceptance call rather than by seeding the success state, so what these tests assert on is
 * the screen the flow actually produces.
 */
async function acceptAsSignedInInvitee() {
  installFetch({ resolve: jsonOk(existingBranch) });
  // No token seeds: under the cookie scheme the open session is what `/sws/neo/session`
  // answers, not what localStorage holds — the stub above is what makes this invitee
  // signed in. All that is left in storage is where they were.
  rememberPreviousTenant();

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
    // `find`, not `get`: the name behind this button comes back from the environments call.
    const stay = await screen.findByTestId('action-stay-in-current');
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

    fireEvent.click(await screen.findByTestId('action-stay-in-current'));

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
  // rendered at all rather than rendered empty. Nothing remembered is the cheapest form of
  // that: the effect bails before it asks the server anything.
  it('does not offer to stay when no tenant was ever entered', async () => {
    installFetch({ resolve: jsonOk(acceptedBranch) });

    renderPage('/invite?token=already-accepted');

    await screen.findByTestId('invite-success-state');
    await settleTenantLookup();
    expect(screen.queryByTestId('action-stay-in-current')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/sws/go/environments'),
      expect.anything()
    );
  });

  /**
   * The offer to stay is resolved by its own unconditional effect, not by a flag the session
   * guard sets. It used to be the latter, and the `accepted` branch exits that guard at its
   * first check — so a signed-in user reopening an invitation they had already accepted was
   * silently denied the choice the freshly-accepted screen gives them, same user, same browser,
   * same session. Answering the question that actually decides it — is there a tenant to go back
   * to? — independently of the branch is what makes the two screens agree, and ETP-4576 kept
   * that independence when it moved the answer from localStorage to the environments call.
   */
  describe('the offer to stay, on the already-accepted screen', () => {
    it('is present and names the remembered company when the environments call resolves it', async () => {
      installFetch({ resolve: jsonOk(acceptedBranch) });
      rememberPreviousTenant();

      renderPage('/invite?token=already-accepted-signed-in');

      await screen.findByTestId('invite-success-state');
      const stay = await screen.findByTestId('action-stay-in-current');
      expect(stay).toHaveTextContent(PREVIOUS_COMPANY);
      expect(stay).not.toHaveTextContent(INVITING_COMPANY);

      fireEvent.click(stay);
      await screen.findByTestId('app-root');
      expect(enterByClientName).not.toHaveBeenCalled();
    });

    // The replacement for develop's "no sf_auth_token": whether a session is open is now the
    // server's answer, not a key the page can read. `GET /sws/go/environments` is
    // account-scoped, so a 401 IS "nobody is signed in here" — and a remembered clientId from
    // some earlier session must not survive it as a button naming a tenant this visitor
    // cannot enter.
    it('is absent when the environments call is rejected', async () => {
      installFetch({ resolve: jsonOk(acceptedBranch), environments: jsonFail(401) });
      rememberPreviousTenant();

      renderPage('/invite?token=no-session');

      await screen.findByTestId('invite-success-state');
      await settleTenantLookup();
      expect(screen.queryByTestId('action-stay-in-current')).not.toBeInTheDocument();
    });

    // Unexpressible under the storage model, where the name WAS the stored value: the
    // remembered tenant can be one the account no longer has — access revoked, client
    // deactivated — and the list comes back healthy without it. Naming nobody is not the risk
    // here; crashing on `match.clientName` of an undefined match is.
    it('is absent when the remembered tenant is not in the returned list', async () => {
      installFetch({ resolve: jsonOk(acceptedBranch) });
      rememberPreviousTenant('CLIENT-REVOKED');

      renderPage('/invite?token=stale-environment');

      await screen.findByTestId('invite-success-state');
      await settleTenantLookup();
      expect(screen.queryByTestId('action-stay-in-current')).not.toBeInTheDocument();
      // Still a working screen, not a blank one: the failure to name a tenant must cost only
      // the second button.
      expect(screen.getByTestId('action-go-to-app')).toBeInTheDocument();
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
    // Awaited BEFORE the fallback is ruled out: the fallback is rendered precisely while the
    // stay button is not, so asserting its absence first would pass in the window where the
    // environments answer has not landed yet — and pass for the wrong reason.
    const stay = await screen.findByTestId('action-stay-in-current');
    // "Stay in <previous company>" already IS a way into the app, so a second fallback button
    // beside it would be two buttons doing the same thing.
    expect(screen.queryByTestId('action-go-to-app-fallback')).not.toBeInTheDocument();

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
