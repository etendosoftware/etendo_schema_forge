// @covers tools/app-shell/src/lib/observability/useSessionStartTracking.js
// @covers tools/app-shell/src/lib/observability/useTenantTypeContext.js
/**
 * ETP-4210 — `useSessionStartTracking` hook coverage.
 *
 * The hook fires `trackSessionStarted` exactly once per mount, regardless of
 * how many times `useAuth()`'s return value changes afterwards (e.g. a silent
 * JWT refresh bumping `token`, or a role/org switch bumping `authRevision`).
 * This is the core fix for ETP-4210: the previous implementation only fired
 * `session_started` from the onboarding wizard, so a regular login by an
 * already-onboarded user never counted toward the Health Score's Login
 * dimension. See `../useSessionStartTracking.js` for the full rationale.
 *
 * ETP-6043 — it also keeps `role_groups` in the common event context.
 * ETP-6072 — it holds `session_started` until the environment list settles, so the event carries
 * `tenant_type`, with a cap so a stuck list never loses the event.
 */
import { act, renderHook } from '@testing-library/react';

const settledList = { environments: [], loading: false, currentClientId: undefined };
const useEnvironmentSwitchMock = vi.fn(() => settledList);
vi.mock('@/hooks/useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: () => useEnvironmentSwitchMock(),
}));

const mockUseAuth = vi.fn();
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
}));

const trackSessionStartedMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../health-events.js', () => ({
  trackSessionStarted: (...args) => trackSessionStartedMock(...args),
}));

const setContextMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../observability.js', () => ({
  setContext: (...args) => setContextMock(...args),
}));

import { SESSION_START_MAX_WAIT_MS, useSessionStartTracking } from '../useSessionStartTracking.js';

const roleGroupsCalls = () => setContextMock.mock.calls.filter(([context]) => 'role_groups' in context);

describe('useSessionStartTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnvironmentSwitchMock.mockImplementation(() => settledList);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires trackSessionStarted once on mount with the values useAuth() returns', () => {
    mockUseAuth.mockReturnValue({ username: 'alice', clientId: 'client-123' });

    renderHook(() => useSessionStartTracking());

    expect(trackSessionStartedMock).toHaveBeenCalledOnce();
    expect(trackSessionStartedMock).toHaveBeenCalledWith({
      username: 'alice',
      clientId: 'client-123',
    });
  });

  it('does NOT call trackSessionStarted again on a re-render with the same auth values', () => {
    mockUseAuth.mockReturnValue({ username: 'alice', clientId: 'client-123' });

    const { rerender } = renderHook(() => useSessionStartTracking());
    rerender();
    rerender();

    expect(trackSessionStartedMock).toHaveBeenCalledOnce();
  });

  it('does NOT call trackSessionStarted again when auth values change after mount (fire-once, not per auth change)', () => {
    mockUseAuth.mockReturnValue({ username: 'alice', clientId: 'client-123' });

    const { rerender } = renderHook(() => useSessionStartTracking());

    // Simulate a silent JWT refresh / role switch changing what useAuth() returns.
    mockUseAuth.mockReturnValue({ username: 'alice', clientId: 'client-456' });
    rerender();

    mockUseAuth.mockReturnValue({ username: 'bob', clientId: 'client-456' });
    rerender();

    expect(trackSessionStartedMock).toHaveBeenCalledOnce();
    expect(trackSessionStartedMock).toHaveBeenCalledWith({
      username: 'alice',
      clientId: 'client-123',
    });
  });

  it('calls trackSessionStarted once even when useAuth() returns undefined username/clientId', () => {
    mockUseAuth.mockReturnValue({ username: undefined, clientId: undefined });

    expect(() => renderHook(() => useSessionStartTracking())).not.toThrow();

    expect(trackSessionStartedMock).toHaveBeenCalledOnce();
    expect(trackSessionStartedMock).toHaveBeenCalledWith({
      username: undefined,
      clientId: undefined,
    });
  });

  it('sets role_groups in the context before session_started fires', () => {
    mockUseAuth.mockReturnValue({
      username: 'alice',
      clientId: 'client-123',
      selectedRole: { id: 'R1', effectiveRoleNames: ['Sales', 'Inventory'] },
    });

    renderHook(() => useSessionStartTracking());

    expect(setContextMock).toHaveBeenCalledWith({ role_groups: ['sales', 'warehouse'] });
    expect(setContextMock.mock.invocationCallOrder[0])
      .toBeLessThan(trackSessionStartedMock.mock.invocationCallOrder[0]);
  });

  it('leaves role_groups out while the role is unknown', () => {
    mockUseAuth.mockReturnValue({ username: 'alice', clientId: 'client-123' });

    renderHook(() => useSessionStartTracking());

    expect(setContextMock).toHaveBeenCalledWith({ role_groups: undefined });
  });

  it('follows a role switch, but not a refresh that hands back an equal role', () => {
    mockUseAuth.mockReturnValue({ selectedRole: { id: 'R1', effectiveRoleNames: ['Sales'] } });
    const { rerender } = renderHook(() => useSessionStartTracking());

    mockUseAuth.mockReturnValue({ selectedRole: { id: 'R1', effectiveRoleNames: ['Sales'] } });
    rerender();
    expect(roleGroupsCalls()).toHaveLength(1);

    mockUseAuth.mockReturnValue({ selectedRole: { id: 'R2', isClientAdmin: true } });
    rerender();
    expect(roleGroupsCalls().at(-1)).toEqual([{ role_groups: ['admin'] }]);
  });

  it('clears role_groups on unmount', () => {
    mockUseAuth.mockReturnValue({ selectedRole: { id: 'R1', effectiveRoleNames: ['Inventory'] } });
    const { unmount } = renderHook(() => useSessionStartTracking());

    unmount();

    expect(roleGroupsCalls().at(-1)).toEqual([{ role_groups: undefined }]);
  });

  it('holds session_started until the environment list settles, then sends it with tenant_type set', () => {
    mockUseAuth.mockReturnValue({ username: 'alice', clientId: 'C-PROD' });
    useEnvironmentSwitchMock.mockImplementation(() => ({ environments: [], loading: true, currentClientId: 'C-PROD' }));
    const { rerender } = renderHook(() => useSessionStartTracking());
    expect(trackSessionStartedMock).not.toHaveBeenCalled();

    useEnvironmentSwitchMock.mockImplementation(() => ({
      environments: [{ clientId: 'C-PROD', environmentType: 'PRODUCTIVE' }],
      loading: false,
      currentClientId: 'C-PROD',
    }));
    rerender();

    expect(trackSessionStartedMock).toHaveBeenCalledOnce();
    const tenantCall = setContextMock.mock.calls.findIndex(([context]) => context.tenant_type === 'productive');
    expect(tenantCall).toBeGreaterThanOrEqual(0);
    expect(setContextMock.mock.invocationCallOrder[tenantCall])
      .toBeLessThan(trackSessionStartedMock.mock.invocationCallOrder[0]);
  });

  it('sends session_started without tenant_type when the list does not settle in time', () => {
    vi.useFakeTimers();
    mockUseAuth.mockReturnValue({ username: 'alice', clientId: 'C-PROD' });
    useEnvironmentSwitchMock.mockImplementation(() => ({ environments: [], loading: true, currentClientId: 'C-PROD' }));
    renderHook(() => useSessionStartTracking());

    act(() => { vi.advanceTimersByTime(SESSION_START_MAX_WAIT_MS - 1); });
    expect(trackSessionStartedMock).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(trackSessionStartedMock).toHaveBeenCalledOnce();
    expect(setContextMock).not.toHaveBeenCalledWith({ tenant_type: 'productive' });
  });

  it('does not send session_started twice when the list settles after the wait expired', () => {
    vi.useFakeTimers();
    useEnvironmentSwitchMock.mockImplementation(() => ({ environments: [], loading: true, currentClientId: 'C-PROD' }));
    const { rerender } = renderHook(() => useSessionStartTracking());
    act(() => { vi.advanceTimersByTime(SESSION_START_MAX_WAIT_MS); });

    useEnvironmentSwitchMock.mockImplementation(() => settledList);
    rerender();

    expect(trackSessionStartedMock).toHaveBeenCalledOnce();
  });

  it('sets the three identity ids in the context before session_started fires (ETP-6228)', () => {
    mockUseAuth.mockReturnValue({
      username: 'alice', clientId: 'C1', userId: 'U1', etgoAccountId: 'A1',
      account: { id: 'MEMBER', email: 'a@x.com' },
    });

    renderHook(() => useSessionStartTracking());

    const identityCall = setContextMock.mock.calls.findIndex(([c]) => 'ad_client_id' in c);
    expect(setContextMock.mock.calls[identityCall][0])
      .toEqual({ ad_user_id: 'U1', ad_client_id: 'C1', etgo_account_id: 'A1' });
    expect(setContextMock.mock.invocationCallOrder[identityCall])
      .toBeLessThan(trackSessionStartedMock.mock.invocationCallOrder[0]);
  });

  it('never sends the signed-in account as the owner account', () => {
    mockUseAuth.mockReturnValue({ clientId: 'C1', userId: 'U1', account: { id: 'MEMBER' } });

    renderHook(() => useSessionStartTracking());

    expect(setContextMock).toHaveBeenCalledWith({ ad_user_id: 'U1', ad_client_id: 'C1', etgo_account_id: undefined });
    expect(JSON.stringify(setContextMock.mock.calls)).not.toContain('MEMBER');
  });

  it('clears the ids when the session is lost while the shell stays mounted', () => {
    mockUseAuth.mockReturnValue({ clientId: 'C1', userId: 'U1', etgoAccountId: 'A1' });
    const { rerender } = renderHook(() => useSessionStartTracking());

    mockUseAuth.mockReturnValue({});
    rerender();

    expect(setContextMock).toHaveBeenLastCalledWith({
      ad_user_id: undefined, ad_client_id: undefined, etgo_account_id: undefined,
    });
  });

  it('replaces all three ids on a company switch and clears them on unmount', () => {
    mockUseAuth.mockReturnValue({ clientId: 'C1', userId: 'U1', etgoAccountId: 'A1' });
    const { rerender, unmount } = renderHook(() => useSessionStartTracking());

    mockUseAuth.mockReturnValue({ clientId: 'C2', userId: 'U1', etgoAccountId: 'A1' });
    rerender();
    expect(setContextMock).toHaveBeenCalledWith({ ad_user_id: 'U1', ad_client_id: 'C2', etgo_account_id: 'A1' });

    unmount();
    expect(setContextMock).toHaveBeenLastCalledWith({
      ad_user_id: undefined, ad_client_id: undefined, etgo_account_id: undefined,
    });
  });

  it('leaves unknown ids undefined instead of reusing another tenant', () => {
    mockUseAuth.mockReturnValue({ clientId: 'C1' });
    renderHook(() => useSessionStartTracking());
    expect(setContextMock).toHaveBeenCalledWith({
      ad_user_id: undefined, ad_client_id: 'C1', etgo_account_id: undefined,
    });
  });
});
