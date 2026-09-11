import { renderHook, act, waitFor } from '@testing-library/react';

// ETP-5195 — switchTo() now persists the new environment's session via the core's
// persistEnvironmentSession(env, data) instead of hand-rolling
// buildEnvironmentSessionStorage(...) + localStorage.setItem. Mock the core onboarding
// modules (api + state) plus this hook's other two collaborators (getApiBase,
// sortEnvironments), following the vi.hoisted convention used by
// src/hooks/__tests__/useSurveyEngine.vitest.jsx for multi-module hook mocking.
//
// ETP-5202 phase 2 — entering a tenant the user has no role in. `GET /sws/go/login` does NOT
// fail for a roleless user: it calls `generateToken(user, null)` and answers 200 with an empty
// `roleList`. Entering on that response writes a session with no role and drops the user into
// an empty app with no explanation. The invited-user path makes it reachable — an admin-created
// user has zero roles until somebody assigns one (ETP-4830). The distinction these tests pin is
// EMPTY vs ABSENT: `[]` is the backend positively saying "no roles", while a missing key is an
// older backend that never sent the field, and `persistEnvironmentSession` already treats it as
// optional. Blocking on absent would lock those deployments out, so it is deliberately allowed
// through.

const onboardingApiMocks = vi.hoisted(() => ({
  fetchEnvironments: vi.fn(),
  loginEnvironment: vi.fn(),
}));

const onboardingStateMocks = vi.hoisted(() => ({
  persistEnvironmentSession: vi.fn(),
}));

const neoResourceMocks = vi.hoisted(() => ({
  getApiBase: vi.fn(() => '/etendo'),
}));

const environmentPresentationMocks = vi.hoisted(() => ({
  // Identity sort — these tests don't care about ordering, only about what
  // reaches persistEnvironmentSession/loginEnvironment.
  sortEnvironments: vi.fn((envs) => envs),
}));

vi.mock('@etendosoftware/etendo-go-core/onboarding/api', () => onboardingApiMocks);
vi.mock('@etendosoftware/etendo-go-core/onboarding/state', () => onboardingStateMocks);
vi.mock('../useNeoResource.js', () => neoResourceMocks);
vi.mock('../../lib/environmentPresentation.js', () => environmentPresentationMocks);

import { useEnvironmentSwitch } from '../useEnvironmentSwitch.js';

const {
  fetchEnvironments: mockFetchEnvironments,
  loginEnvironment: mockLoginEnvironment,
} = onboardingApiMocks;
const { persistEnvironmentSession: mockPersistEnvironmentSession } = onboardingStateMocks;

const ACME = {
  clientId: 'CLIENT-ACME',
  clientName: 'Acme Corp',
  adminUserId: 'USER-1',
  adminUserName: 'acme.admin',
};

function setLocation(overrides = {}) {
  // jsdom throws "Not implemented: navigation" on a real assignment to
  // window.location.href — replace the object first, matching the pattern in
  // src/hooks/__tests__/useServiceWorker.vitest.jsx for the same constraint.
  delete window.location;
  window.location = { href: '', ...overrides };
}

/** `enabled: false` mirrors InviteAcceptancePage: no listing on mount, one-shot entry only. */
function renderDisabled() {
  return renderHook(() => useEnvironmentSwitch({ enabled: false }));
}

describe('useEnvironmentSwitch', () => {
  let originalLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    originalLocation = window.location;
    setLocation();
    mockFetchEnvironments.mockResolvedValue([]);
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  describe('switchTo', () => {
    it('does not call switchTo collaborators when there is no platform/auth token', async () => {
      const { result } = renderHook(() => useEnvironmentSwitch());

      await act(async () => {
        await result.current.switchTo({ clientId: 'c1', adminUserId: 'u1' });
      });

      expect(mockLoginEnvironment).not.toHaveBeenCalled();
      expect(mockPersistEnvironmentSession).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
    });

    it('does not call switchTo collaborators when the target env has no adminUserId', async () => {
      localStorage.setItem('sf_platform_token', 'platform-tok');
      const { result } = renderHook(() => useEnvironmentSwitch());

      await act(async () => {
        await result.current.switchTo({ clientId: 'c1' });
      });

      expect(mockLoginEnvironment).not.toHaveBeenCalled();
      expect(mockPersistEnvironmentSession).not.toHaveBeenCalled();
    });

    it('persists the new session via persistEnvironmentSession BEFORE navigating, on a successful login', async () => {
      localStorage.setItem('sf_platform_token', 'platform-tok');
      const env = { clientId: 'c1', adminUserId: 'u1' };
      const loginData = { token: 'new-tenant-token' };
      let persistedBeforeNavigation = false;
      mockLoginEnvironment.mockResolvedValue(loginData);
      mockPersistEnvironmentSession.mockImplementation(() => {
        persistedBeforeNavigation = window.location.href === '';
      });

      const { result } = renderHook(() => useEnvironmentSwitch());

      await act(async () => {
        await result.current.switchTo(env);
      });

      expect(mockLoginEnvironment).toHaveBeenCalledWith(fetch, '/etendo', 'platform-tok', env);
      expect(mockPersistEnvironmentSession).toHaveBeenCalledTimes(1);
      expect(mockPersistEnvironmentSession).toHaveBeenCalledWith(env, loginData);
      expect(persistedBeforeNavigation).toBe(true);
      expect(window.location.href).toBe('/');
    });

    it('falls back to sf_auth_token when there is no sf_platform_token', async () => {
      localStorage.setItem('sf_auth_token', 'auth-tok');
      const env = { clientId: 'c2', adminUserId: 'u2' };
      mockLoginEnvironment.mockResolvedValue({ token: 'new-tenant-token' });

      const { result } = renderHook(() => useEnvironmentSwitch());

      await act(async () => {
        await result.current.switchTo(env);
      });

      expect(mockLoginEnvironment).toHaveBeenCalledWith(fetch, '/etendo', 'auth-tok', env);
      expect(mockPersistEnvironmentSession).toHaveBeenCalledWith(env, { token: 'new-tenant-token' });
    });

    it('does not persist or navigate when loginEnvironment resolves without a token', async () => {
      localStorage.setItem('sf_platform_token', 'platform-tok');
      mockLoginEnvironment.mockResolvedValue({});

      const { result } = renderHook(() => useEnvironmentSwitch());

      await act(async () => {
        await result.current.switchTo({ clientId: 'c1', adminUserId: 'u1' });
      });

      expect(mockPersistEnvironmentSession).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
      expect(result.current.switching).toBeNull();
    });

    it('does not persist or navigate when loginEnvironment rejects', async () => {
      localStorage.setItem('sf_platform_token', 'platform-tok');
      mockLoginEnvironment.mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => useEnvironmentSwitch());

      await act(async () => {
        await result.current.switchTo({ clientId: 'c1', adminUserId: 'u1' });
      });

      expect(mockPersistEnvironmentSession).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
      expect(result.current.switching).toBeNull();
    });

    // ETP-5202, 10 — the roleless response. Answering 200 is what makes this dangerous: nothing
    // upstream treats it as a failure, so the refusal has to happen here, BEFORE anything is
    // persisted.
    it('refuses to enter when roleList is explicitly empty', async () => {
      localStorage.setItem('sf_platform_token', 'platform-jwt');
      mockLoginEnvironment.mockResolvedValue({ token: 'tenant-jwt', roleList: [] });
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.switchTo(ACME);
      });

      expect(entered).toBe(false);
      expect(mockPersistEnvironmentSession).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
      // Not left spinning on a button that will never navigate.
      await waitFor(() => expect(result.current.switching).toBeNull());
    });

    // ETP-5202, 11 — the ordinary case still works; the guard must not cost the happy path.
    it('writes the session and navigates when a role is present', async () => {
      localStorage.setItem('sf_platform_token', 'platform-jwt');
      const loginData = {
        token: 'tenant-jwt',
        roleList: [{ id: 'ROLE-1', name: 'Admin', organizationList: [] }],
      };
      mockLoginEnvironment.mockResolvedValue(loginData);
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.switchTo(ACME);
      });

      expect(entered).toBe(true);
      expect(mockPersistEnvironmentSession).toHaveBeenCalledWith(ACME, loginData);
      expect(window.location.href).toBe('/');
    });

    // ETP-5202, 12 — backwards compatibility, pinned on purpose: an ABSENT roleList is not the
    // backend saying "no roles", and a deployment that never sends the field must keep working.
    it('still enters when roleList is absent', async () => {
      localStorage.setItem('sf_platform_token', 'platform-jwt');
      const loginData = { token: 'tenant-jwt' };
      mockLoginEnvironment.mockResolvedValue(loginData);
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.switchTo(ACME);
      });

      expect(entered).toBe(true);
      expect(mockPersistEnvironmentSession).toHaveBeenCalledWith(ACME, loginData);
      expect(window.location.href).toBe('/');
    });
  });

  describe('mount / environment listing', () => {
    it('loads environments on mount when enabled, using the platform token', async () => {
      localStorage.setItem('sf_platform_token', 'platform-tok');
      const envs = [{ clientId: 'c1' }, { clientId: 'c2' }];
      mockFetchEnvironments.mockResolvedValue(envs);

      const { result } = renderHook(() => useEnvironmentSwitch());

      await waitFor(() => expect(result.current.environments).toEqual(envs));
      expect(mockFetchEnvironments).toHaveBeenCalledWith(fetch, '/etendo', 'platform-tok');
    });

    it('does not load environments when disabled', () => {
      localStorage.setItem('sf_platform_token', 'platform-tok');

      renderHook(() => useEnvironmentSwitch({ enabled: false }));

      expect(mockFetchEnvironments).not.toHaveBeenCalled();
    });
  });

  describe('enterByClientName', () => {
    // ETP-5202, 13 — a name that is not in the list. The caller (the invitation success screen)
    // needs a definite false so it can offer its own escape route instead of appearing to hang.
    it('returns false and touches nothing when the company is not in the list', async () => {
      localStorage.setItem('sf_platform_token', 'platform-jwt');
      mockFetchEnvironments.mockResolvedValue([ACME]);
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.enterByClientName('Some Other Company');
      });

      expect(entered).toBe(false);
      expect(mockLoginEnvironment).not.toHaveBeenCalled();
      expect(mockPersistEnvironmentSession).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
      await waitFor(() => expect(result.current.switching).toBeNull());
    });

    it('enters the matching company, matching by name case-insensitively', async () => {
      localStorage.setItem('sf_platform_token', 'platform-jwt');
      mockFetchEnvironments.mockResolvedValue([ACME]);
      const loginData = {
        token: 'tenant-jwt',
        roleList: [{ id: 'ROLE-1', name: 'Admin', organizationList: [] }],
      };
      mockLoginEnvironment.mockResolvedValue(loginData);
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.enterByClientName('  acme corp  ');
      });

      expect(entered).toBe(true);
      expect(mockLoginEnvironment).toHaveBeenCalledWith(
        fetch,
        '/etendo',
        'platform-jwt',
        expect.objectContaining({ clientId: 'CLIENT-ACME' })
      );
      expect(mockPersistEnvironmentSession).toHaveBeenCalledWith(ACME, loginData);
    });

    // The list is re-fetched rather than reused: the tenant the user just joined cannot be in
    // a list loaded before the invitation was accepted.
    it('re-reads the environment list on every call', async () => {
      localStorage.setItem('sf_platform_token', 'platform-jwt');
      mockFetchEnvironments.mockResolvedValue([]);
      const { result } = renderDisabled();

      await act(async () => {
        await result.current.enterByClientName('Acme Corp');
      });
      await act(async () => {
        await result.current.enterByClientName('Acme Corp');
      });

      expect(mockFetchEnvironments).toHaveBeenCalledTimes(2);
    });

    // The roleless refusal has to survive the path the invitation screen actually uses, not
    // only a direct `switchTo`.
    it('propagates the roleless refusal', async () => {
      localStorage.setItem('sf_platform_token', 'platform-jwt');
      mockFetchEnvironments.mockResolvedValue([ACME]);
      mockLoginEnvironment.mockResolvedValue({ token: 'tenant-jwt', roleList: [] });
      const { result } = renderDisabled();

      let entered;
      await act(async () => {
        entered = await result.current.enterByClientName('Acme Corp');
      });

      expect(entered).toBe(false);
      expect(mockPersistEnvironmentSession).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
    });

    it('returns false when the environment list cannot be read', async () => {
      localStorage.setItem('sf_platform_token', 'platform-jwt');
      mockFetchEnvironments.mockRejectedValue(new Error('network down'));
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
      expect(mockFetchEnvironments).not.toHaveBeenCalled();
    });
  });
});
