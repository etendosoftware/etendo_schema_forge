import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import enUS from '@/locales/en_US.json';
import InviteAcceptancePage from '../InviteAcceptancePage.jsx';

/**
 * ETP-5202 — the "somebody else is signed in on this browser" guard.
 *
 * `/invite?token=…` is a PUBLIC route that only ever wrote `sf_platform_token`, so accepting
 * an invitation while another account was live left two identities in the same browser and
 * "Go to app" landed the invitee inside the previous person's tenant. These tests pin the
 * guard's four states and, just as importantly, the paths it must NOT touch.
 *
 * Sibling file `InviteAcceptancePage.vitest.jsx` keeps the pre-guard acceptance flows; the
 * external boundaries stubbed here are the same ones it stubs (i18n dictionaries, the SSO
 * provider SDK) plus `useLogout`, which the conflict screen calls.
 *
 * `useUI` resolves against the REAL en_US dictionary rather than echoing the key, because the
 * conflict copy is assembled with `{currentUser}` / `{invitedEmail}` placeholder substitution
 * — echoing the key would make every placeholder assertion vacuously pass.
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
  getConfiguredSsoProviders: () => ['google'],
  renderSsoProviderButton: async () => {},
  loadGoogleIdentityScript: async () => {},
  buildGoogleSsoPayload: (payload) => payload,
  readCookie: () => null,
}));

// One stable function identity for the whole file: `useApiFetch` memoizes on the logout
// identity, so a hook returning a fresh function per render would produce a fresh `apiFetch`
// per render and the guard effect (which lists it as a dependency) would loop forever.
const logoutSpy = vi.fn();
vi.mock('@/auth/useLogout.js', () => ({
  useLogout: () => logoutSpy,
}));

const INVITED_EMAIL = 'invitee@example.com';
const OTHER_EMAIL = 'someone.else@example.com';

const registrationBranch = {
  status: 'SENT',
  clientName: 'Acme Corp',
  email: INVITED_EMAIL,
  maskedEmail: 'i***e@example.com',
  branch: 'registration_required',
  accountExists: false,
};

const existingBranch = {
  status: 'SENT',
  clientName: 'Acme Corp',
  email: INVITED_EMAIL,
  maskedEmail: 'i***e@example.com',
  branch: 'existing_account',
  accountExists: true,
};

const jsonOk = (body) => ({ ok: true, status: 200, json: async () => body });
const jsonFail = (status, body = {}) => ({ ok: false, status, json: async () => body });

/**
 * Routes by URL instead of call order: the guard fires a variable number of
 * `/sws/neo/session` requests (0, 1 or 2) depending on which tokens are stored, so a
 * `mockResolvedValueOnce` chain would silently shift under it.
 */
function installFetch({ resolve: resolveResponse, session }) {
  const calls = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/sws/go/company-invitations/resolve')) {
      return resolveResponse;
    }
    if (String(url).includes('/sws/neo/session')) {
      const bearer = (options.headers?.Authorization || '').replace('Bearer ', '');
      return session ? session(bearer) : jsonFail(401);
    }
    return jsonFail(404);
  });
  globalThis.fetch = fetchMock;
  return { fetchMock, calls };
}

function sessionCalls(calls) {
  return calls.filter((c) => c.url.includes('/sws/neo/session'));
}

/**
 * Records whether a `data-testid` was EVER in the document, not just whether it is there now.
 * "No flicker" is a claim about the intermediate commits, and a plain `queryByTestId` after
 * the fact cannot see a surface that appeared and was replaced — which is exactly the shape
 * of the bug this file guards against.
 *
 * The instrument is proved, not assumed: `renders the checking screen …` below asserts a
 * positive sighting through this same watcher, so a silent observer would fail there first.
 */
function watchForTestId(testId) {
  const selector = `[data-testid="${testId}"]`;
  const state = { seen: false };
  const sample = () => {
    if (document.querySelector(selector)) state.seen = true;
  };
  const observer = new MutationObserver(sample);
  observer.observe(document.body, { childList: true, subtree: true });
  sample();
  return {
    get seen() {
      sample();
      return state.seen;
    },
    stop: () => {
      sample();
      observer.disconnect();
    },
  };
}

function renderPage(initialEntry = '/invite?token=valid-token-123') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/invite" element={<InviteAcceptancePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('InviteAcceptancePage — ETP-5202 session guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    logoutSpy.mockClear();
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1 — Regression guard for the untouched path: with no session stored, the guard must
  // resolve to CLEAR without touching the network and the pre-ETP-5202 flow must be intact.
  it('does not prompt when no session is stored', async () => {
    const { calls } = installFetch({ resolve: jsonOk(registrationBranch) });

    renderPage('/invite?token=fresh-browser');

    await waitFor(() => {
      expect(screen.getByTestId('invite-new-account')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('invite-session-conflict')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-session-checking')).not.toBeInTheDocument();
    expect(sessionCalls(calls)).toHaveLength(0);
  });

  // 1b — …and it must not flash the checking screen on the way there either. With nothing
  // stored there is no identity to resolve, so the guard owes the fresh-browser invitee a
  // direct path to the acceptance surface, not a spinner.
  it('goes straight to the acceptance surface with no checking flicker when no session is stored', async () => {
    installFetch({ resolve: jsonOk(registrationBranch) });
    const checking = watchForTestId('invite-session-checking');

    renderPage('/invite?token=fresh-browser-no-flicker');

    await waitFor(() => {
      expect(screen.getByTestId('invite-new-account')).toBeInTheDocument();
    });
    checking.stop();
    expect(checking.seen).toBe(false);
  });

  // 2 — Same person, another tenant: a legitimate multi-tenant flow, so prompting there
  // would be pure noise. Case and surrounding whitespace must not defeat the match.
  it('does not prompt when the open session belongs to the invitee', async () => {
    installFetch({
      resolve: jsonOk(existingBranch),
      session: () => jsonOk({ accountEmail: '  INVITEE@Example.COM  ' }),
    });
    globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');

    renderPage('/invite?token=same-person');

    await waitFor(() => {
      expect(screen.getByTestId('invite-shared-login')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('invite-session-conflict')).not.toBeInTheDocument();
  });

  // 3 — The bug this ticket is about: a different account is live in the browser.
  it('blocks the acceptance surface when a different account is signed in', async () => {
    installFetch({
      resolve: jsonOk(existingBranch),
      session: () => jsonOk({ accountEmail: OTHER_EMAIL }),
    });
    globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');

    renderPage('/invite?token=foreign-session');

    const conflict = await screen.findByTestId('invite-session-conflict');
    expect(conflict).toBeInTheDocument();
    expect(screen.queryByTestId('invite-shared-login')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-new-account')).not.toBeInTheDocument();

    // The prompt has to name BOTH identities, or the user cannot tell which one is closing.
    expect(conflict).toHaveTextContent(OTHER_EMAIL);
    expect(conflict).toHaveTextContent(INVITED_EMAIL);
    expect(conflict.textContent).not.toContain('{currentUser}');
    expect(conflict.textContent).not.toContain('{invitedEmail}');
    expect(screen.getByTestId('action-close-session')).toBeInTheDocument();
    expect(screen.getByTestId('action-defer-invitation')).toBeInTheDocument();
  });

  // 3b — the registration branch is gated by the same guard, not only the login one.
  it('blocks the registration surface too when a different account is signed in', async () => {
    installFetch({
      resolve: jsonOk(registrationBranch),
      session: () => jsonOk({ accountEmail: OTHER_EMAIL }),
    });
    globalThis.localStorage.setItem('sf_platform_token', 'platform-jwt');

    renderPage('/invite?token=foreign-session-register');

    await screen.findByTestId('invite-session-conflict');
    expect(screen.queryByTestId('invite-new-account')).not.toBeInTheDocument();
  });

  // 4 — Fail SAFE, not open: a session that exists but cannot be identified still prompts,
  // with the copy that does not claim to know who is signed in.
  it('prompts with the unknown-user copy when the identity cannot be resolved', async () => {
    const { calls } = installFetch({
      resolve: jsonOk(existingBranch),
      session: () => jsonFail(500),
    });
    globalThis.localStorage.setItem('sf_auth_token', 'stale-jwt');
    globalThis.localStorage.setItem('sf_platform_token', 'stale-platform');

    renderPage('/invite?token=unidentifiable-session');

    const conflict = await screen.findByTestId('invite-session-conflict');
    expect(conflict).toHaveTextContent(INVITED_EMAIL);
    expect(conflict.textContent).not.toContain('{currentUser}');
    expect(conflict).toHaveTextContent(LABELS.inviteSessionConflictLogoutUnknown);
    expect(conflict).not.toHaveTextContent(OTHER_EMAIL);
    // Both tokens were tried before giving up.
    expect(sessionCalls(calls)).toHaveLength(2);
  });

  // 5 — A tenant JWT is not always present (expired, or a platform-only session); the
  // platform token is the documented fallback.
  it('falls back to the platform token when no tenant token is stored', async () => {
    const { calls } = installFetch({
      resolve: jsonOk(existingBranch),
      session: (bearer) => (bearer === 'platform-jwt'
        ? jsonOk({ accountEmail: OTHER_EMAIL })
        : jsonFail(401)),
    });
    globalThis.localStorage.setItem('sf_platform_token', 'platform-jwt');

    renderPage('/invite?token=platform-only');

    await screen.findByTestId('invite-session-conflict');

    const sessionRequests = sessionCalls(calls);
    expect(sessionRequests).toHaveLength(1);
    expect(sessionRequests[0].options.headers.Authorization).toBe('Bearer platform-jwt');
  });

  // 5b — A session that never went through the environment switch holds the SAME value under
  // both keys, so the fallback would ask the identical question twice. Pinned because the
  // guarding condition reads like a redundant equality check and invites being "simplified"
  // back to `readAccountEmail(authToken) || readAccountEmail(platformToken)`, which silently
  // doubles the request on the most common shape of session.
  it('asks once when both storage keys hold the same token', async () => {
    const { calls } = installFetch({
      resolve: jsonOk(existingBranch),
      session: () => jsonOk({ accountEmail: OTHER_EMAIL }),
    });
    globalThis.localStorage.setItem('sf_auth_token', 'same-jwt');
    globalThis.localStorage.setItem('sf_platform_token', 'same-jwt');

    renderPage('/invite?token=duplicate-token');

    // The outcome must be unchanged by the de-duplication: still a conflict, still named.
    const conflict = await screen.findByTestId('invite-session-conflict');
    expect(conflict).toHaveTextContent(OTHER_EMAIL);

    const sessionRequests = sessionCalls(calls);
    expect(sessionRequests).toHaveLength(1);
    expect(sessionRequests[0].options.headers.Authorization).toBe('Bearer same-jwt');
  });

  // 6 — Closing the previous session must happen BEFORE anything else and must reload back
  // into /invite with the token still in the query string, or the invitee lands on a
  // "missing token" error with the other person's session already destroyed.
  it('signs the previous user out and reloads with the token still in the URL', async () => {
    installFetch({
      resolve: jsonOk(existingBranch),
      session: () => jsonOk({ accountEmail: OTHER_EMAIL }),
    });
    globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');

    const order = [];
    logoutSpy.mockImplementation(() => order.push('logout'));
    const replace = vi.fn((url) => order.push(`replace:${url}`));
    vi.stubGlobal('location', { pathname: '/invite', replace });

    renderPage('/invite?token=tok%20en');

    fireEvent.click(await screen.findByTestId('action-close-session'));

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['logout', 'replace:/invite?token=tok%20en']);
    expect(replace.mock.calls[0][0]).toContain('tok%20en');
  });

  // 6b — The session was already destroyed by the time the handler runs, so leaving the user
  // on the conflict screen is not an option. An environment without `location.replace` must
  // still navigate, by assignment.
  it('navigates by href when location.replace is unavailable', async () => {
    installFetch({
      resolve: jsonOk(existingBranch),
      session: () => jsonOk({ accountEmail: OTHER_EMAIL }),
    });
    globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');

    const fakeLocation = { pathname: '/invite', href: '' };
    vi.stubGlobal('location', fakeLocation);

    renderPage('/invite?token=tok%20en');

    fireEvent.click(await screen.findByTestId('action-close-session'));

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(fakeLocation.href).toBe('/invite?token=tok%20en');
  });

  // 6c — CHECKING is a real, reachable state, not decoration. It regressed once already: the
  // effect settles on CLEAR during its first run (branch still unknown), so without an explicit
  // return to CHECKING the credential surface renders for the whole duration of the identity
  // request — over a live foreign session. The pending promise below holds the page in exactly
  // that window.
  it('renders the checking screen, and no credential surface, while the identity request is in flight', async () => {
    let releaseSession;
    const pendingSession = new Promise((resolve) => { releaseSession = resolve; });
    installFetch({
      resolve: jsonOk(existingBranch),
      session: async () => {
        await pendingSession;
        return jsonOk({ accountEmail: OTHER_EMAIL });
      },
    });
    globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');
    // Proves the watcher used by the no-flicker tests can actually see a transient surface.
    const checking = watchForTestId('invite-session-checking');

    renderPage('/invite?token=in-flight');

    await screen.findByTestId('invite-session-checking');
    expect(checking.seen).toBe(true);
    expect(screen.queryByTestId('invite-shared-login')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-new-account')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-session-conflict')).not.toBeInTheDocument();

    releaseSession();

    // Once the identity is known, the state machine moves on rather than stalling on the spinner.
    const conflict = await screen.findByTestId('invite-session-conflict');
    expect(conflict).toHaveTextContent(OTHER_EMAIL);
    expect(screen.queryByTestId('invite-session-checking')).not.toBeInTheDocument();
    // The watcher still reports the sighting after the element is gone — that memory is the
    // whole point of using it for the no-flicker assertions, so pin it here rather than trust it.
    checking.stop();
    expect(checking.seen).toBe(true);
  });

  // 7 — "I will accept later" is a terminal state that writes nothing and clears nothing:
  // the other person's session must survive the invitee's visit untouched.
  it('defers without writing, clearing, or signing anybody out', async () => {
    installFetch({
      resolve: jsonOk(existingBranch),
      session: () => jsonOk({ accountEmail: OTHER_EMAIL }),
    });
    globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');

    // Spies installed AFTER the fixture write, so only the component's own writes count.
    const setItem = vi.spyOn(globalThis.localStorage, 'setItem');
    const removeItem = vi.spyOn(globalThis.localStorage, 'removeItem');
    const clear = vi.spyOn(globalThis.localStorage, 'clear');

    renderPage('/invite?token=later-please');

    fireEvent.click(await screen.findByTestId('action-defer-invitation'));

    const deferred = await screen.findByTestId('invite-session-deferred');
    expect(deferred).toHaveTextContent(INVITED_EMAIL);
    expect(screen.queryByTestId('invite-session-conflict')).not.toBeInTheDocument();
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem('sf_auth_token')).toBe('tenant-jwt');
  });

  // 8 — The guard only owns the two actionable branches. An already-accepted invitation and
  // an expired token are terminal states it must not hijack, foreign session or not.
  it('does not hijack the already-accepted state when a foreign session is open', async () => {
    const { calls } = installFetch({
      resolve: jsonOk({ status: 'ACCEPTED', clientName: 'Acme Corp', branch: 'accepted' }),
      session: () => jsonOk({ accountEmail: OTHER_EMAIL }),
    });
    globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');

    renderPage('/invite?token=already-accepted');

    await waitFor(() => {
      expect(screen.getByTestId('invite-success-state')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('invite-session-conflict')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-session-checking')).not.toBeInTheDocument();
    // Non-actionable branch: no identity lookup is even attempted.
    expect(sessionCalls(calls)).toHaveLength(0);
  });

  it('does not hijack the invalid-token error state when a foreign session is open', async () => {
    const { calls } = installFetch({
      resolve: jsonFail(400, { error: true, code: 'EXPIRED_TOKEN', message: 'expired' }),
      session: () => jsonOk({ accountEmail: OTHER_EMAIL }),
    });
    globalThis.localStorage.setItem('sf_auth_token', 'tenant-jwt');

    renderPage('/invite?token=expired');

    await waitFor(() => {
      expect(screen.getByTestId('invite-error-state')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('invite-session-conflict')).not.toBeInTheDocument();
    expect(sessionCalls(calls)).toHaveLength(0);
  });
});
