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

describe('useViewerRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when unauthenticated (does not call fetchMenuTree)', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });

    const { result } = renderHook(() => useViewerRole());

    expect(result.current).toBeNull();
    expect(mockFetchMenuTree).not.toHaveBeenCalled();
  });

  it('resolves to { roleId, isClientAdmin } once authenticated', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
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
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockFetchMenuTree.mockResolvedValue({ tree: [], count: 0, viewerRoleId: 'role-2' });

    const { result } = renderHook(() => useViewerRole());

    await waitFor(() => expect(result.current).toEqual({ roleId: 'role-2', isClientAdmin: false }));
  });

  it('returns null when the response has no viewerRoleId (e.g. no role assigned)', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockFetchMenuTree.mockResolvedValue({ tree: [], count: 0 });

    const { result } = renderHook(() => useViewerRole());

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('returns null (does not throw) when fetchMenuTree rejects', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockFetchMenuTree.mockRejectedValue(new Error('SFListMenu unreachable'));

    const { result } = renderHook(() => useViewerRole());

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toBeNull());
  });
});
