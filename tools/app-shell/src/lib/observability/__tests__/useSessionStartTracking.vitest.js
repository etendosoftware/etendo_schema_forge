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
});
