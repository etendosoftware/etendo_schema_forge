// @covers tools/app-shell/src/lib/observability/useSessionStartTracking.js
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
 */
import { renderHook } from '@testing-library/react';

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

import { useSessionStartTracking } from '../useSessionStartTracking.js';

describe('useSessionStartTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(setContextMock).toHaveBeenCalledOnce();

    mockUseAuth.mockReturnValue({ selectedRole: { id: 'R2', isClientAdmin: true } });
    rerender();
    expect(setContextMock).toHaveBeenLastCalledWith({ role_groups: ['admin'] });
  });

  it('clears role_groups on unmount', () => {
    mockUseAuth.mockReturnValue({ selectedRole: { id: 'R1', effectiveRoleNames: ['Inventory'] } });
    const { unmount } = renderHook(() => useSessionStartTracking());

    unmount();

    expect(setContextMock).toHaveBeenLastCalledWith({ role_groups: undefined });
  });
});
