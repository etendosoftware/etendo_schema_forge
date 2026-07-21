import { renderHook, waitFor } from '@testing-library/react';

// ETP-4598 — role-filtered sidebar. useRoleMenu() consumes useAuth() (to know
// when to fetch) and fetchMenuTree/collectAllowedIds from lib/menuTree.js
// (to build the allowed-id Set). Mock both collaborators.
const mockUseAuth = vi.fn();
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockFetchMenuTree = vi.fn();
const mockCollectAllowedIds = vi.fn();
vi.mock('@/lib/menuTree.js', () => ({
  fetchMenuTree: (...args) => mockFetchMenuTree(...args),
  collectAllowedIds: (...args) => mockCollectAllowedIds(...args),
}));

import { useRoleMenu } from '../useRoleMenu.js';

describe('useRoleMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when unauthenticated (does not call fetchMenuTree)', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });

    const { result } = renderHook(() => useRoleMenu());

    expect(result.current).toBeNull();
    expect(mockFetchMenuTree).not.toHaveBeenCalled();
  });

  it('fetches the tree once authenticated and returns collectAllowedIds(tree)', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    const tree = [{ windowId: '108' }];
    mockFetchMenuTree.mockResolvedValue({ tree, count: 1 });
    const allowedIds = new Set(['108']);
    mockCollectAllowedIds.mockReturnValue(allowedIds);

    const { result } = renderHook(() => useRoleMenu());

    await waitFor(() => expect(result.current).toBe(allowedIds));

    expect(mockFetchMenuTree).toHaveBeenCalledTimes(1);
    expect(mockCollectAllowedIds).toHaveBeenCalledWith(tree);
  });

  it('returns null (does not throw) when fetchMenuTree rejects', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockFetchMenuTree.mockRejectedValue(new Error('SFListMenu unreachable'));

    const { result } = renderHook(() => useRoleMenu());

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));

    expect(result.current).toBeNull();
    expect(mockCollectAllowedIds).not.toHaveBeenCalled();
  });

  it('returns undefined (not null) while the fetch is still in flight, then resolves to the Set', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    // Manually-resolvable promise so we can observe the transient in-flight
    // state before fetchMenuTree() settles (ETP-4598 FOUC fix regression test).
    let resolveFetch;
    mockFetchMenuTree.mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; })
    );
    const tree = [{ windowId: '108' }];
    const allowedIds = new Set(['108']);
    mockCollectAllowedIds.mockReturnValue(allowedIds);

    const { result } = renderHook(() => useRoleMenu());

    // Immediately after the first render, the fetch promise has not resolved yet.
    expect(result.current).toBeUndefined();
    expect(result.current).not.toBeNull();

    resolveFetch({ tree, count: 1 });

    await waitFor(() => expect(result.current).toBe(allowedIds));
  });

  it('rapid auth flip with out-of-order resolution: B (started later) wins, and A (cancelled) resolving late does not clobber it', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });

    let resolveA;
    let resolveB;
    const promiseA = new Promise((resolve) => { resolveA = resolve; });
    const promiseB = new Promise((resolve) => { resolveB = resolve; });
    mockFetchMenuTree
      .mockReturnValueOnce(promiseA)
      .mockReturnValueOnce(promiseB);

    const setA = new Set(['A']);
    const setB = new Set(['B']);
    mockCollectAllowedIds.mockImplementation((tree) => (tree === 'tree-a' ? setA : setB));

    const { result, rerender } = renderHook(() => useRoleMenu());

    // Fetch A kicked off, still in flight.
    expect(result.current).toBeUndefined();
    expect(mockFetchMenuTree).toHaveBeenCalledTimes(1);

    // Flip to unauthenticated BEFORE A resolves: cleanup marks A's effect
    // cancelled, and the new effect snaps state to null synchronously.
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    rerender();
    expect(result.current).toBeNull();

    // Flip back to authenticated: starts fetch B.
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    rerender();
    expect(mockFetchMenuTree).toHaveBeenCalledTimes(2);

    // B resolves first (out-of-order vs. A, which was started earlier).
    resolveB({ tree: 'tree-b' });
    await waitFor(() => expect(result.current).toBe(setB));

    // A resolves late, after being cancelled — must NOT clobber B's result.
    resolveA({ tree: 'tree-a' });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBe(setB);
  });

  it('does not update state (or warn) after unmount while a fetch is still in flight', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    let resolveFetch;
    mockFetchMenuTree.mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; })
    );
    mockCollectAllowedIds.mockReturnValue(new Set(['1']));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useRoleMenu());
    unmount();

    // Resolve after unmount — the effect cleanup's `cancelled` flag should
    // prevent the post-unmount setAllowedIds() call, so React never warns
    // about a state update on an unmounted component.
    resolveFetch({ tree: [{ windowId: '1' }] });
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
