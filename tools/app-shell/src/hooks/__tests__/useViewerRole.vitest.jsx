import { renderHook, waitFor } from '@testing-library/react';

// Viewer-role gating follow-up (ETP-5019) — useViewerRole() consumes useAuth() (to know when to
// fetch) and fetchMenuTree from lib/menuTree.js (SFListMenu's viewerRoleId/viewerIsClientAdmin
// fields), mirroring useRoleMenu.js's own mocking convention. Mock both collaborators.
const mockUseAuth = vi.fn();
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockFetchMenuTree = vi.fn();
vi.mock('@/lib/menuTree.js', () => ({
  fetchMenuTree: (...args) => mockFetchMenuTree(...args),
}));

import { useViewerRole } from '../useViewerRole.js';

// ETP-5195 — useAuth() also exposes isSessionReady/authRevision/captureSession/
// isCurrentSession now (the ownership-guard rework shared with useRoleMenu.js). Default the
// mock to "session ready, always current" so every pre-existing "authenticated and resolves"
// test below still reaches the fetch exactly as it did before that rework.
function authState(overrides = {}) {
  return {
    isAuthenticated: true,
    isSessionReady: true,
    authRevision: 0,
    captureSession: () => ({}),
    isCurrentSession: () => true,
    ...overrides,
  };
}

describe('useViewerRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when unauthenticated (does not call fetchMenuTree)', () => {
    mockUseAuth.mockReturnValue(authState({ isAuthenticated: false }));

    const { result } = renderHook(() => useViewerRole());

    expect(result.current).toBeNull();
    expect(mockFetchMenuTree).not.toHaveBeenCalled();
  });

  it('resolves to { roleId, isClientAdmin } once authenticated', async () => {
    mockUseAuth.mockReturnValue(authState());
    mockFetchMenuTree.mockResolvedValue({
      tree: [],
      count: 0,
      viewerRoleId: 'role-1',
      viewerIsClientAdmin: true,
    });

    const { result } = renderHook(() => useViewerRole());

    await waitFor(() => expect(result.current).toEqual({ roleId: 'role-1', isClientAdmin: true }));
    expect(mockFetchMenuTree).toHaveBeenCalledTimes(1);
  });

  it('coerces a missing/falsy viewerIsClientAdmin to false', async () => {
    mockUseAuth.mockReturnValue(authState());
    mockFetchMenuTree.mockResolvedValue({ tree: [], count: 0, viewerRoleId: 'role-2' });

    const { result } = renderHook(() => useViewerRole());

    await waitFor(() => expect(result.current).toEqual({ roleId: 'role-2', isClientAdmin: false }));
  });

  it('returns null when the response has no viewerRoleId (e.g. no role assigned)', async () => {
    mockUseAuth.mockReturnValue(authState());
    mockFetchMenuTree.mockResolvedValue({ tree: [], count: 0 });

    const { result } = renderHook(() => useViewerRole());

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('returns null (does not throw) when fetchMenuTree rejects', async () => {
    mockUseAuth.mockReturnValue(authState());
    mockFetchMenuTree.mockRejectedValue(new Error('SFListMenu unreachable'));

    const { result } = renderHook(() => useViewerRole());

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('returns undefined and does not fetch while authenticated but the session is not ready yet', () => {
    mockUseAuth.mockReturnValue(authState({ isSessionReady: false }));

    const { result } = renderHook(() => useViewerRole());

    expect(result.current).toBeUndefined();
    expect(mockFetchMenuTree).not.toHaveBeenCalled();
  });

  it('does not apply a resolved response once the session is no longer current', async () => {
    mockUseAuth.mockReturnValue(authState({ isCurrentSession: () => false }));
    mockFetchMenuTree.mockResolvedValue({
      tree: [],
      count: 0,
      viewerRoleId: 'role-3',
      viewerIsClientAdmin: true,
    });

    const { result } = renderHook(() => useViewerRole());

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));
    // Give the resolved promise's `.then` a tick to run (and be ignored).
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeUndefined();
  });

  it('re-fetches when authRevision changes while authenticated and session-ready', async () => {
    mockFetchMenuTree.mockResolvedValue({ tree: [], count: 0, viewerRoleId: 'role-4' });
    mockUseAuth.mockReturnValue(authState({ authRevision: 0 }));

    const { rerender } = renderHook(() => useViewerRole());
    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));

    mockUseAuth.mockReturnValue(authState({ authRevision: 1 }));
    rerender();

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(2));
  });
});
