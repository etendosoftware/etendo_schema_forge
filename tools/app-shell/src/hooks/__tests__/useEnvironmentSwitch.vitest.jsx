// @covers tools/app-shell/src/hooks/useEnvironmentSwitch.js
import { render, renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider, createMemoryAuthStorage, useAuth as useCoreAuth } from '@etendosoftware/app-shell-core/auth';
import { DataProvider, createQueryCache } from '@etendosoftware/app-shell-core/data';

/**
 * ETP-5202 phase 2 — entering a tenant the user has no role in.
 *
 * `GET /sws/go/login` does NOT fail for a roleless user: it calls `generateToken(user, null)`
 * and answers 200 with an empty `roleList`. Entering on that response writes a session with no
 * role and drops the user into an empty app with no explanation. The invited-user path makes
 * it reachable — an admin-created user has zero roles until somebody assigns one (ETP-4830).
 *
 * The distinction these tests pin is EMPTY vs ABSENT: `[]` is the backend positively saying
 * "no roles", while a missing key is an older backend that never sent the field, and
 * `buildEnvironmentSessionStorage` already treats it as optional. Blocking on absent would
 * lock those deployments out, so it is deliberately allowed through.
 *
 * The core's real `buildEnvironmentSessionStorage` is used rather than a stub: what matters is
 * which `sf_auth_*` keys actually land in storage, and a stub would only re-state this test's
 * own assumptions about them.
 */
const fetchEnvironments = vi.fn();
const loginEnvironment = vi.fn();

vi.mock('@etendosoftware/etendo-go-core/onboarding/api', () => ({
  fetchEnvironments: (...args) => fetchEnvironments(...args),
  loginEnvironment: (...args) => loginEnvironment(...args),
}));

// ETP-4576 — the hook reads the session from the auth context, not from `sf_auth_token` in
// localStorage as it did when these cases were written. `csrfToken` is what it forwards to
// `loginEnvironment` as the third argument, which is why the assertions below still name
// 'platform-jwt' there: the slot survived, its meaning changed from credential to proof.
// Mutable on purpose: the logout case flips `isAuthenticated`; `beforeEach` restores it.
const SESSION_DEFAULTS = { isAuthenticated: true, csrfToken: 'platform-jwt', clientId: 'CLIENT-HOME' };
const SESSION = { ...SESSION_DEFAULTS };
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => SESSION,
  useAuthOptional: () => SESSION,
}));

import { ENVIRONMENT_LIST_REFRESH_EVENT, useEnvironmentSwitch } from '../useEnvironmentSwitch.js';
import { applySupportSessionFromServer, resetSupportSessionForTests } from '@/lib/supportSession.js';
import {
  setUnsavedChanges, subscribeNavigationPrompt, cancelPendingNavigation, confirmPendingNavigation,
  installUnloadGuard, resetUnsavedChangesForTests,
} from '@/lib/unsavedChanges.js';

const ACME = {
  clientId: 'CLIENT-ACME',
  clientName: 'Acme Corp',
  adminUserId: 'USER-1',
  adminUserName: 'acme.admin',
};

const AUTH_KEYS = [
  'sf_auth_token',
  'sf_auth_user',
  'sf_auth_client_id',
  'sf_auth_client_name',
  'sf_auth_rolelist',
  'sf_auth_selected_role',
  'sf_auth_selected_org',
];

function writtenAuthKeys() {
  return AUTH_KEYS.filter((key) => globalThis.localStorage.getItem(key) !== null);
}

/** `enabled: false` mirrors InviteAcceptancePage: no listing on mount, one-shot entry only. */
function renderDisabled() {
  return renderHook(() => useEnvironmentSwitch({ enabled: false }));
}

const BETA = { clientId: 'CLIENT-BETA', clientName: 'Beta Ltd', adminUserId: 'USER-B', adminUserName: 'beta.admin' };
const NEW_CO = { clientId: 'CLIENT-NEW', clientName: 'New Co', adminUserId: 'USER-N', adminUserName: 'new.admin' };

/** One hook instance; records every render so a test can read the state of the FIRST one. */
function Consumer({ slot, seen, history, options }) {
  const state = useEnvironmentSwitch(options);
  seen[slot] = state;
  (history[slot] ??= []).push({ loading: state.loading, environments: state.environments });
  return null;
}

/** Hands the test the real core session actions, so it can change the DataProvider identity. */
function CaptureAuth({ into }) {
  into.current = useCoreAuth();
  return null;
}

const ids = (envs) => envs.map((env) => env.clientId);

/**
 * Mounts `slots` hook instances under the real AuthProvider + DataProvider, as the app does.
 * `mount(slots)` re-renders with another set of slots: a slot that was not there before is a
 * NEW mount, the existing ones stay mounted. Pass `withProvider: false` for the provider-free
 * tree (InviteAcceptancePage).
 */
function renderInstances({ slots = [0], cache = createQueryCache(), optionsFor = () => undefined, withProvider = true } = {}) {
  const seen = [];
  const history = [];
  const auth = { current: null };
  const session = { csrfToken: 'csrf-1', clientId: 'CLIENT-HOME' };
  const storage = createMemoryAuthStorage(session);
  const consumers = (list) => list.map((slot) => (
    <Consumer key={slot} slot={slot} seen={seen} history={history} options={optionsFor(slot)} />
  ));
  const tree = (list) => (withProvider ? (
    <AuthProvider storage={storage} initialSession={session} restoreSession={null}>
      <DataProvider cache={cache}>
        <CaptureAuth into={auth} />
        {consumers(list)}
      </DataProvider>
    </AuthProvider>
  ) : <>{consumers(list)}</>);
  const view = render(tree(slots));
  return { seen, history, auth, mount: (list) => view.rerender(tree(list)) };
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

async function refreshEvent() {
  await act(async () => {
    window.dispatchEvent(new Event(ENVIRONMENT_LIST_REFRESH_EVENT));
  });
}

describe('useEnvironmentSwitch', () => {
  let fakeLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    // `mockReset`, not only `clearAllMocks`: a `mockResolvedValueOnce` queue a test did not
    // consume (the in-flight case leaves one on purpose) must not leak into the next test.
    fetchEnvironments.mockReset();
    loginEnvironment.mockReset();
    Object.assign(SESSION, SESSION_DEFAULTS);
    globalThis.localStorage.clear();
    // `switchTo` navigates by assigning `location.href`; jsdom refuses a real navigation, and
    // `getApiBase()` reads `pathname`, so both live on the stub.
    fakeLocation = { pathname: '/', href: '' };
    vi.stubGlobal('location', fakeLocation);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refetches and publishes the canonical environment list when provisioning announces a refresh', async () => {
    const newlyProvisioned = {
      clientId: 'CREATED-CLIENT',
      clientName: 'Acme Productive',
      adminUserId: 'USER-2',
      adminUserName: 'acme.productive.admin',
      plan: 'productive',
    };
    fetchEnvironments
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([newlyProvisioned]);
    const { result } = renderHook(() => useEnvironmentSwitch({ enabled: true }));

    await waitFor(() => expect(fetchEnvironments).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new Event(ENVIRONMENT_LIST_REFRESH_EVENT));
    });
    await waitFor(() => expect(fetchEnvironments).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.environments).toEqual([newlyProvisioned]));
  });

  // ETP-5051 O-3 — the hook is mounted by the banners, the side menu, the top bar, the tenant
  // plan and the layout, so one page load used to send ~6 identical `GET /sws/go/environments`,
  // each of which runs the live quota counts of every listed tenant on the backend. Under the
  // app's DataProvider every mounted instance must share one request and one result, and the
  // refresh event must still reach all of them with ONE new request. The AuthProvider and the
  // DataProvider are the real ones: they own the cache and its session scope.
  it('shares one request across mounted instances and one more per refresh event', async () => {
    const first = [ACME];
    const refreshed = [ACME, { ...ACME, clientId: 'CLIENT-NEW', clientName: 'New Co' }];
    fetchEnvironments.mockResolvedValueOnce(first).mockResolvedValueOnce(refreshed);
    const seen = [];
    function Consumer({ slot }) {
      seen[slot] = useEnvironmentSwitch();
      return null;
    }
    const session = { csrfToken: 'csrf-1', clientId: 'CLIENT-HOME' };
    render(
      <AuthProvider storage={createMemoryAuthStorage(session)} initialSession={session} restoreSession={null}>
        <DataProvider cache={createQueryCache()}>
          {[0, 1, 2, 3, 4, 5].map((slot) => <Consumer key={slot} slot={slot} />)}
        </DataProvider>
      </AuthProvider>,
    );

    await waitFor(() => expect(seen.every((s) => !s.loading && s.environments.length === 1)).toBe(true));
    expect(fetchEnvironments).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event(ENVIRONMENT_LIST_REFRESH_EVENT));
    });
    await waitFor(() => expect(seen.every((s) => !s.loading && s.environments.length === 2)).toBe(true));
    expect(fetchEnvironments).toHaveBeenCalledTimes(2);
    expect(seen.map((s) => s.environments.map((env) => env.clientId)))
      .toEqual(Array(6).fill(['CLIENT-ACME', 'CLIENT-NEW']));
  });

  // ETP-5051 O-3 — the edges of the shared read. The cache is the core's real
  // `createQueryCache` under the real AuthProvider/DataProvider; only the network is mocked.
  describe('shared environment list', () => {
    it('does not cache a failed read: the next mount retries and gets the list', async () => {
      fetchEnvironments.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce([ACME]);
      const { seen, mount } = renderInstances();

      await waitFor(() => expect(seen[0].loading).toBe(false));
      expect(seen[0].environments).toEqual([]);

      mount([0, 1]);
      await waitFor(() => expect(seen[1].loading).toBe(false));
      expect(ids(seen[1].environments)).toEqual(['CLIENT-ACME']);
      expect(fetchEnvironments).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed read: a refresh event retries and gets the list', async () => {
      fetchEnvironments.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce([ACME]);
      const { seen } = renderInstances();

      await waitFor(() => expect(seen[0].loading).toBe(false));
      expect(seen[0].environments).toEqual([]);

      await refreshEvent();
      await waitFor(() => expect(ids(seen[0].environments)).toEqual(['CLIENT-ACME']));
      expect(seen[0].loading).toBe(false);
      expect(fetchEnvironments).toHaveBeenCalledTimes(2);
    });

    // A late mount (the banner that appears after the menu) must not flash a loading state
    // or send a request for a list another instance just read.
    it('starts a mount made while the list is fresh with the list, not loading, and no request', async () => {
      fetchEnvironments.mockResolvedValue([ACME]);
      const { seen, history, mount } = renderInstances();
      await waitFor(() => expect(ids(seen[0].environments)).toEqual(['CLIENT-ACME']));

      mount([0, 1]);
      expect(history[1][0].loading).toBe(false);
      expect(ids(history[1][0].environments)).toEqual(['CLIENT-ACME']);
      await act(async () => {});
      expect(fetchEnvironments).toHaveBeenCalledTimes(1);
    });

    // The freshness window is the DataProvider's record stale time, 30 s by default. The cache
    // clock is injected rather than faked, so the AuthProvider's own timers are left alone.
    it('reads again for a mount made once the 30 s freshness window has passed', async () => {
      let clock = 0;
      fetchEnvironments.mockResolvedValueOnce([ACME]).mockResolvedValueOnce([ACME, NEW_CO]);
      const { seen, history, mount } = renderInstances({ cache: createQueryCache({ now: () => clock }) });
      await waitFor(() => expect(ids(seen[0].environments)).toEqual(['CLIENT-ACME']));

      clock = 29_999;
      mount([0, 1]);
      expect(history[1][0].loading).toBe(false);
      await act(async () => {});
      expect(fetchEnvironments).toHaveBeenCalledTimes(1);

      clock = 30_000;
      mount([0, 1, 2]);
      expect(history[2][0]).toEqual({ loading: true, environments: [] });
      await waitFor(() => expect(ids(seen[2].environments)).toEqual(['CLIENT-ACME', 'CLIENT-NEW']));
      expect(fetchEnvironments).toHaveBeenCalledTimes(2);
    });

    // The DataProvider clears its cache and changes its key when the session identity changes;
    // these pin that the hook really reads through that identity, so a list read for one
    // session is never handed to the next one.
    it.each([
      ['a new csrf token', (auth) => auth.setCsrfToken('csrf-2')],
      ['another client', (auth) => auth.setSession({ clientId: 'CLIENT-OTHER' })],
    ])('does not hand the previous list to a mount or a refresh after %s', async (_label, changeIdentity) => {
      fetchEnvironments
        .mockResolvedValueOnce([ACME])
        .mockResolvedValueOnce([BETA])
        .mockResolvedValueOnce([BETA, NEW_CO]);
      const { seen, history, auth, mount } = renderInstances();
      await waitFor(() => expect(ids(seen[0].environments)).toEqual(['CLIENT-ACME']));

      act(() => changeIdentity(auth.current));
      mount([0, 1]);
      expect(history[1][0]).toEqual({ loading: true, environments: [] });
      await waitFor(() => expect(ids(seen[1].environments)).toEqual(['CLIENT-BETA']));
      expect(fetchEnvironments).toHaveBeenCalledTimes(2);

      await refreshEvent();
      await waitFor(() => expect(seen.every((s) => !s.loading && s.environments.length === 2)).toBe(true));
      expect(seen.map((s) => ids(s.environments))).toEqual(Array(2).fill(['CLIENT-BETA', 'CLIENT-NEW']));
      expect(fetchEnvironments).toHaveBeenCalledTimes(3);
    });

    it('does not let a refresh after an identity change join the previous session read', async () => {
      const oldRead = deferred();
      fetchEnvironments.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce([BETA]);
      const { seen, history, auth } = renderInstances();
      await waitFor(() => expect(fetchEnvironments).toHaveBeenCalledTimes(1));

      act(() => auth.current.setCsrfToken('csrf-2'));
      await refreshEvent();
      expect(fetchEnvironments).toHaveBeenCalledTimes(2);

      // The old session's answer lands late: it must not reach the instance.
      await act(async () => { oldRead.resolve([ACME]); });
      await waitFor(() => expect(seen[0].loading).toBe(false));
      expect(ids(seen[0].environments)).toEqual(['CLIENT-BETA']);
      expect(history[0].some((h) => ids(h.environments).includes('CLIENT-ACME'))).toBe(false);
    });

    // Review MINOR-1 — an identity change (role/org switch, an `authRevision` bump) WHILE the shared
    // read is in flight: the DataProvider clears the cache, core's `fetchQuery` rejects the pending
    // read with an AbortError when it settles, and without a re-read every instance stayed at `[]`
    // with nothing to trigger another read. Every instance must re-read once under the new key
    // (sharing that one request) and end with the new session's list.
    it('re-reads once under the new identity when it changes while the read is in flight', async () => {
      const oldRead = deferred();
      fetchEnvironments.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce([BETA]);
      const { seen, history, auth } = renderInstances({ slots: [0, 1, 2] });
      await waitFor(() => expect(fetchEnvironments).toHaveBeenCalledTimes(1));

      act(() => auth.current.setCsrfToken('csrf-2'));
      await act(async () => { oldRead.resolve([ACME]); });

      await waitFor(() => expect(seen.every((s) => !s.loading && s.environments.length === 1)).toBe(true));
      expect(seen.map((s) => ids(s.environments))).toEqual(Array(3).fill(['CLIENT-BETA']));
      expect(fetchEnvironments).toHaveBeenCalledTimes(2);
      expect(history.flat().some((h) => ids(h.environments).includes('CLIENT-ACME'))).toBe(false);
    });

    // The hook reads `isAuthenticated` from the mocked `@/auth/AuthContext.jsx`, so the test
    // signs out on BOTH sides: the core provider (which clears the cache) and the mocked session.
    it('empties the list on logout, and neither a mount nor a refresh reads while signed out', async () => {
      fetchEnvironments.mockResolvedValue([ACME]);
      const { seen, auth, mount } = renderInstances();
      await waitFor(() => expect(ids(seen[0].environments)).toEqual(['CLIENT-ACME']));

      act(() => auth.current.logout());
      SESSION.isAuthenticated = false;
      mount([0, 1]);
      await waitFor(() => expect(seen.every((s) => !s.loading && s.environments.length === 0)).toBe(true));

      await refreshEvent();
      expect(seen.map((s) => s.environments)).toEqual([[], []]);
      expect(fetchEnvironments).toHaveBeenCalledTimes(1);
    });

    // InviteAcceptancePage can mount with no AuthProvider/DataProvider above it.
    it('without a DataProvider every instance reads the network itself', async () => {
      fetchEnvironments.mockResolvedValue([ACME]);
      const { seen } = renderInstances({ slots: [0, 1, 2], withProvider: false });

      await waitFor(() => expect(seen.every((s) => !s.loading && s.environments.length === 1)).toBe(true));
      expect(fetchEnvironments).toHaveBeenCalledTimes(3);

      await refreshEvent();
      await waitFor(() => expect(fetchEnvironments).toHaveBeenCalledTimes(6));
    });

    // Documented limit, pinned on purpose: `fetchQuery` coalesces a forced read with a pending
    // one, so a refresh dispatched while the first read is still in flight gets THAT read's
    // answer, not a new one. If the core starts honouring `force` over a pending read, this
    // fails — revisit the hook's comment and this test together.
    it('joins the in-flight read when a refresh fires before the first read settled', async () => {
      const firstRead = deferred();
      fetchEnvironments.mockReturnValueOnce(firstRead.promise).mockResolvedValueOnce([ACME, NEW_CO]);
      const { seen } = renderInstances();
      await waitFor(() => expect(fetchEnvironments).toHaveBeenCalledTimes(1));

      await refreshEvent();
      expect(fetchEnvironments).toHaveBeenCalledTimes(1);

      await act(async () => { firstRead.resolve([ACME]); });
      await waitFor(() => expect(seen[0].loading).toBe(false));
      expect(ids(seen[0].environments)).toEqual(['CLIENT-ACME']);
      expect(fetchEnvironments).toHaveBeenCalledTimes(1);
    });

    // The just-provisioned tenant cannot be in a list cached before it existed.
    it('enterByClientName reads the network even when a fresh list is cached', async () => {
      fetchEnvironments.mockResolvedValueOnce([ACME]).mockResolvedValueOnce([ACME, NEW_CO]);
      loginEnvironment.mockResolvedValue({ status: 'success', roleList: [{ id: 'ROLE-1' }] });
      const cache = createQueryCache({ now: () => 0 }); // never goes stale
      const { seen } = renderInstances({ cache });
      await waitFor(() => expect(ids(seen[0].environments)).toEqual(['CLIENT-ACME']));

      let entered;
      await act(async () => {
        entered = await seen[0].enterByClientName('New Co');
      });

      expect(entered).toBe(true);
      expect(fetchEnvironments).toHaveBeenCalledTimes(2);
      expect(loginEnvironment).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(String),
        'platform-jwt',
        expect.objectContaining({ clientId: 'CLIENT-NEW' }),
      );
    });

    it('never reads for an enabled:false instance, nor hands it the shared list', async () => {
      fetchEnvironments.mockResolvedValue([ACME]);
      const { seen, history, mount } = renderInstances({
        slots: [0, 1],
        optionsFor: (slot) => (slot === 2 ? undefined : { enabled: false }),
      });

      await refreshEvent();
      expect(fetchEnvironments).not.toHaveBeenCalled();
      expect(seen.map((s) => [s.loading, s.environments])).toEqual([[false, []], [false, []]]);

      // An enabled sibling fills the cache; a disabled instance mounted afterwards ignores it.
      mount([0, 1, 2]);
      await waitFor(() => expect(ids(seen[2].environments)).toEqual(['CLIENT-ACME']));
      mount([0, 1, 2, 3]);
      expect(history[3][0]).toEqual({ loading: false, environments: [] });
      await act(async () => {});
      expect(fetchEnvironments).toHaveBeenCalledTimes(1);
      expect([0, 1, 3].map((slot) => seen[slot].environments)).toEqual([[], [], []]);
    });
  });

  describe('switchTo', () => {
    // 10 — the roleless response. Answering 200 is what makes this dangerous: nothing upstream
    // treats it as a failure, so the refusal has to happen here, BEFORE anything is written.
    it('refuses to enter when roleList is explicitly empty', async () => {
      loginEnvironment.mockResolvedValue({ status: 'success', roleList: [] });
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.switchTo(ACME);
      });

      expect(entered).toBe(false);
      expect(writtenAuthKeys()).toEqual([]);
      expect(fakeLocation.href).toBe('');
      // Not left spinning on a button that will never navigate.
      await waitFor(() => expect(result.current.switching).toBeNull());
    });

    // 11 — the ordinary case still works; the guard must not cost the happy path.
    it('writes the session and navigates when a role is present', async () => {
      loginEnvironment.mockResolvedValue({
        status: 'success',
        roleList: [{ id: 'ROLE-1', name: 'Admin', organizationList: [] }],
      });
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.switchTo(ACME);
      });

      expect(entered).toBe(true);
      // ETP-4576 — entering no longer writes a session tuple: POST /sws/go/session/environment
      // rotates the `__Host-` cookie and returns no token to store. What is left on the client
      // is the preference for which tenant to return to, and it must stay OUT of the session
      // keys so a logout does not forget it.
      expect(globalThis.localStorage.getItem('sf_last_environment')).toBe('CLIENT-ACME');
      expect(writtenAuthKeys()).toEqual([]);
      expect(fakeLocation.href).toBe('/');
    });

    // 12 — backwards compatibility, pinned on purpose: an ABSENT roleList is not the backend
    // saying "no roles", and a deployment that never sends the field must keep working.
    it('still enters when roleList is absent', async () => {
      loginEnvironment.mockResolvedValue({ status: 'success' });
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.switchTo(ACME);
      });

      expect(entered).toBe(true);
      expect(globalThis.localStorage.getItem('sf_last_environment')).toBe('CLIENT-ACME');
      expect(writtenAuthKeys()).toEqual([]);
      expect(fakeLocation.href).toBe('/');
    });

    // Was "yields no token": there is no token in the response any more, so what marks a
    // refused entry is the absence of `status: 'success'`. The property is unchanged — a
    // backend that did not actually switch must not navigate or leave anything behind.
    it('returns false without navigating when the login does not report success', async () => {
      loginEnvironment.mockResolvedValue({ roleList: [{ id: 'ROLE-1' }] });
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.switchTo(ACME);
      });

      expect(entered).toBe(false);
      expect(writtenAuthKeys()).toEqual([]);
      expect(fakeLocation.href).toBe('');
    });
  });

  // ETP-5888 — switching from a form with unsaved changes. The switch used to rotate the session
  // first and leave the only warning to the browser's `beforeunload`: cancelling it kept the page
  // on the old tenant against a session on the new one, with `switching` stuck for good.
  describe('switchTo behind the unsaved-changes guard', () => {
    const ROLE_OK = { status: 'success', roleList: [{ id: 'ROLE-1', name: 'Admin', organizationList: [] }] };
    let prompt;

    beforeEach(() => {
      resetUnsavedChangesForTests();
      prompt = vi.fn();
      subscribeNavigationPrompt(prompt);
      setUnsavedChanges('invoice-form', true);
      loginEnvironment.mockResolvedValue(ROLE_OK);
    });

    afterEach(() => resetUnsavedChangesForTests());

    it('asks before touching the session when a form is dirty', async () => {
      const { result } = renderDisabled();

      act(() => { result.current.switchTo(ACME); });

      expect(prompt).toHaveBeenCalledWith(true);
      expect(loginEnvironment).not.toHaveBeenCalled();
      expect(fakeLocation.href).toBe('');
    });

    it('leaves session, page and switcher untouched when the user cancels', async () => {
      const { result } = renderDisabled();

      let pending;
      act(() => { pending = result.current.switchTo(ACME); });
      act(() => { cancelPendingNavigation(); });

      await expect(pending).resolves.toBe(false);
      expect(loginEnvironment).not.toHaveBeenCalled();
      expect(fakeLocation.href).toBe('');
      expect(result.current.switching).toBeNull();
    });

    it('switches once the user discards, without a second native prompt', async () => {
      const removeUnloadGuard = installUnloadGuard();
      try {
        const { result } = renderDisabled();

        let pending;
        act(() => { pending = result.current.switchTo(ACME); });
        await act(async () => {
          confirmPendingNavigation();
          await pending;
        });

        expect(loginEnvironment).toHaveBeenCalledTimes(1);
        expect(fakeLocation.href).toBe('/');
        // The form is still registered as dirty; only the suppression keeps the reload from
        // raising the browser's prompt on top of the one the user just answered.
        const unload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(false);
      } finally {
        removeUnloadGuard();
      }
    });

    it('releases the spinner enterByClientName set when the user cancels', async () => {
      fetchEnvironments.mockResolvedValue([ACME]);
      const { result } = renderDisabled();

      let pending;
      act(() => { pending = result.current.enterByClientName('Acme Corp'); });
      await waitFor(() => expect(prompt).toHaveBeenCalledWith(true));
      act(() => { cancelPendingNavigation(); });

      await expect(pending).resolves.toBe(false);
      expect(loginEnvironment).not.toHaveBeenCalled();
      await waitFor(() => expect(result.current.switching).toBeNull());
    });

    it('switches straight away when no form is dirty', async () => {
      resetUnsavedChangesForTests();
      subscribeNavigationPrompt(prompt);
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.switchTo(ACME);
      });

      expect(entered).toBe(true);
      expect(prompt).not.toHaveBeenCalled();
      expect(fakeLocation.href).toBe('/');
    });
  });

  describe('enterByClientName', () => {
    // 13 — a name that is not in the list. The caller (the invitation success screen) needs a
    // definite false so it can offer its own escape route instead of appearing to hang.
    it('returns false and touches nothing when the company is not in the list', async () => {
      fetchEnvironments.mockResolvedValue([ACME]);
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.enterByClientName('Some Other Company');
      });

      expect(entered).toBe(false);
      expect(loginEnvironment).not.toHaveBeenCalled();
      expect(writtenAuthKeys()).toEqual([]);
      expect(fakeLocation.href).toBe('');
      await waitFor(() => expect(result.current.switching).toBeNull());
    });

    it('enters the matching company, matching by name case-insensitively', async () => {
      fetchEnvironments.mockResolvedValue([ACME]);
      loginEnvironment.mockResolvedValue({
        status: 'success',
        roleList: [{ id: 'ROLE-1', name: 'Admin', organizationList: [] }],
      });
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.enterByClientName('  acme corp  ');
      });

      expect(entered).toBe(true);
      expect(loginEnvironment).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(String),
        'platform-jwt',
        expect.objectContaining({ clientId: 'CLIENT-ACME' })
      );
      expect(globalThis.localStorage.getItem('sf_last_environment')).toBe('CLIENT-ACME');
    });

    // The list is re-fetched rather than reused: the tenant the user just joined cannot be in
    // a list loaded before the invitation was accepted.
    it('re-reads the environment list on every call', async () => {
      fetchEnvironments.mockResolvedValue([]);
      const { result } = renderDisabled();

      await act(async () => {
        await result.current.enterByClientName('Acme Corp');
      });
      await act(async () => {
        await result.current.enterByClientName('Acme Corp');
      });

      expect(fetchEnvironments).toHaveBeenCalledTimes(2);
    });

    // The roleless refusal has to survive the path the invitation screen actually uses, not
    // only a direct `switchTo`.
    it('propagates the roleless refusal', async () => {
      fetchEnvironments.mockResolvedValue([ACME]);
      loginEnvironment.mockResolvedValue({ status: 'success', roleList: [] });
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.enterByClientName('Acme Corp');
      });

      expect(entered).toBe(false);
      expect(writtenAuthKeys()).toEqual([]);
      expect(fakeLocation.href).toBe('');
    });

    it('returns false when the environment list cannot be read', async () => {
      fetchEnvironments.mockRejectedValue(new Error('network down'));
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.enterByClientName('Acme Corp');
      });

      expect(entered).toBe(false);
      await waitFor(() => expect(result.current.switching).toBeNull());
    });

    it('returns false for an empty company name without calling the backend', async () => {
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.enterByClientName('   ');
      });

      expect(entered).toBe(false);
      expect(fetchEnvironments).not.toHaveBeenCalled();
    });
  });

  // ETP-5351 — a support session is pinned to the tenant its ticket was issued for. Changing company
  // means a new ticket from Classic (a new audit row), so the hook offers nothing to switch to and
  // refuses to switch even if a caller asks.
  describe('in a support session', () => {
    beforeEach(() => {
      applySupportSessionFromServer(
        { clientId: 'CLIENT-HOME', clientName: 'Home Corp', expiresAt: '2026-10-05T11:00:00Z' },
        { storage: globalThis.localStorage },
      );
    });

    afterEach(() => {
      resetSupportSessionForTests();
    });

    it('lists the current company alone and never switches', async () => {
      fetchEnvironments.mockResolvedValue([
        { clientId: 'CLIENT-HOME', clientName: 'Home Corp', adminUserId: 'USER-0' },
        ACME,
      ]);
      const { result } = renderHook(() => useEnvironmentSwitch({ enabled: true }));

      await waitFor(() => expect(result.current.environments.map((env) => env.clientId)).toEqual(['CLIENT-HOME']));

      let entered;
      await act(async () => {
        entered = await result.current.switchTo(ACME);
      });

      expect(entered).toBe(false);
      expect(loginEnvironment).not.toHaveBeenCalled();
      expect(fakeLocation.href).toBe('');
    });
  });
});
