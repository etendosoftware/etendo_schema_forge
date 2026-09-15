import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
const SESSION = { isAuthenticated: true, csrfToken: 'platform-jwt', clientId: 'CLIENT-HOME' };
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => SESSION,
  useAuthOptional: () => SESSION,
}));

import { useEnvironmentSwitch } from '../useEnvironmentSwitch.js';

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

describe('useEnvironmentSwitch', () => {
  let fakeLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage.clear();
    // `switchTo` navigates by assigning `location.href`; jsdom refuses a real navigation, and
    // `getApiBase()` reads `pathname`, so both live on the stub.
    fakeLocation = { pathname: '/', href: '' };
    vi.stubGlobal('location', fakeLocation);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
});
