// @covers tools/app-shell/src/hooks/useSupportSessionSync.js
import { renderHook, waitFor } from '@testing-library/react';

const authRef = vi.hoisted(() => ({ current: { isAuthenticated: true, clientId: 'C1' } }));
const pathRef = vi.hoisted(() => ({ current: '/dashboard' }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuthOptional: () => authRef.current }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: pathRef.current }) }));

const fetchSupportSession = vi.hoisted(() => vi.fn());
const applySupportSessionFromServer = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supportSession.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchSupportSession,
  applySupportSessionFromServer,
}));

import { useSupportSessionSync } from '../useSupportSessionSync.js';

const SESSION = { clientId: 'C1', clientName: 'Acme', expiresAt: '2026-10-05T11:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  authRef.current = { isAuthenticated: true, clientId: 'C1' };
  pathRef.current = '/dashboard';
  fetchSupportSession.mockResolvedValue(SESSION);
});

describe('useSupportSessionSync', () => {
  it('reads /me when authenticated and applies the result', async () => {
    renderHook(() => useSupportSessionSync());
    await waitFor(() => expect(applySupportSessionFromServer).toHaveBeenCalledWith(SESSION));
    expect(fetchSupportSession).toHaveBeenCalledTimes(1);
  });

  it('does not read /me when anonymous', () => {
    authRef.current = { isAuthenticated: false, clientId: null };
    renderHook(() => useSupportSessionSync());
    expect(fetchSupportSession).not.toHaveBeenCalled();
  });

  it('does not read /me on the handoff page', () => {
    pathRef.current = '/support-access';
    renderHook(() => useSupportSessionSync());
    expect(fetchSupportSession).not.toHaveBeenCalled();
  });

  it('keeps the current mode when /me cannot be read', async () => {
    fetchSupportSession.mockRejectedValue(new Error('GET /sws/go/me answered 500'));
    renderHook(() => useSupportSessionSync());
    await waitFor(() => expect(fetchSupportSession).toHaveBeenCalled());
    await Promise.resolve();
    expect(applySupportSessionFromServer).not.toHaveBeenCalled();
  });

  it('reads /me again when the session moves to another client', async () => {
    const { rerender } = renderHook(() => useSupportSessionSync());
    await waitFor(() => expect(applySupportSessionFromServer).toHaveBeenCalledTimes(1));
    authRef.current = { isAuthenticated: true, clientId: 'C2' };
    rerender();
    await waitFor(() => expect(fetchSupportSession).toHaveBeenCalledTimes(2));
  });
});
