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

// ETP-5195 — useAuth() also exposes isSessionReady/authRevision/captureSession/
// isCurrentSession now (the ownership-guard rework shared with useViewerRole.js). Default the
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

describe('useRoleMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when unauthenticated (does not call fetchMenuTree)', () => {
    mockUseAuth.mockReturnValue(authState({ isAuthenticated: false }));

    const { result } = renderHook(() => useRoleMenu());

    expect(result.current).toBeNull();
    expect(mockFetchMenuTree).not.toHaveBeenCalled();
  });

  it('returns undefined and does not fetch while authenticated but the session is not ready yet', () => {
    mockUseAuth.mockReturnValue(authState({ isSessionReady: false }));

    const { result } = renderHook(() => useRoleMenu());

    expect(result.current).toBeUndefined();
    expect(mockFetchMenuTree).not.toHaveBeenCalled();
  });

  it('does not apply a resolved response once the session is no longer current', async () => {
    mockUseAuth.mockReturnValue(authState({ isCurrentSession: () => false }));
    const tree = [{ windowId: '999' }];
    mockFetchMenuTree.mockResolvedValue({ tree, count: 1 });
    mockCollectAllowedIds.mockReturnValue(new Set(['999']));

    const { result } = renderHook(() => useRoleMenu());

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));
    // Give the resolved promise's `.then` a tick to run (and be ignored).
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeUndefined();
    expect(mockCollectAllowedIds).not.toHaveBeenCalled();
  });

  it('re-fetches when authRevision changes while authenticated and session-ready', async () => {
    const tree = [{ windowId: '1' }];
    mockFetchMenuTree.mockResolvedValue({ tree, count: 1 });
    mockCollectAllowedIds.mockReturnValue(new Set(['1']));
    mockUseAuth.mockReturnValue(authState({ authRevision: 0 }));

    const { rerender } = renderHook(() => useRoleMenu());
    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));

    mockUseAuth.mockReturnValue(authState({ authRevision: 1 }));
    rerender();

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(2));
  });

  it('fetches the tree once authenticated and returns collectAllowedIds(tree)', async () => {
    mockUseAuth.mockReturnValue(authState());
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
    mockUseAuth.mockReturnValue(authState());
    mockFetchMenuTree.mockRejectedValue(new Error('SFListMenu unreachable'));

    const { result } = renderHook(() => useRoleMenu());

    await waitFor(() => expect(mockFetchMenuTree).toHaveBeenCalledTimes(1));

    // The hook is `undefined` while the fetch is in flight and only flips to `null` once the
    // rejection's `.catch` runs (a microtask after fetchMenuTree is called). Await that state
    // instead of asserting synchronously — under full-suite load the catch hasn't run yet when the
    // fetchMenuTree-called waitFor resolves, which flaked as "expected undefined to be null".
    await waitFor(() => expect(result.current).toBeNull());
    expect(mockCollectAllowedIds).not.toHaveBeenCalled();
  });

  it('returns undefined (not null) while the fetch is still in flight, then resolves to the Set', async () => {
    mockUseAuth.mockReturnValue(authState());
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
    // A persistent (not per-authState()) session tracker: each captureSession() call bumps a
    // shared counter and isCurrentSession(snapshot) only matches the LATEST captured snapshot —
    // this mirrors the real controller.capture()/controller.isCurrent() ownership guard closely
    // enough to prove the actual regression this test guards against (a stale response
    // clobbering fresher state). A fresh authState() default per mockReturnValue call would
    // reset this tracking and defeat the test.
    let current = 0;
    const captureSession = () => ++current;
    const isCurrentSession = (snapshot) => snapshot === current;

    mockUseAuth.mockReturnValue(authState({ captureSession, isCurrentSession }));

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

    // Flip to unauthenticated BEFORE A resolves: the unauthenticated branch snaps state to
    // null synchronously without capturing a new session.
    mockUseAuth.mockReturnValue(authState({ isAuthenticated: false, captureSession, isCurrentSession }));
    rerender();
    expect(result.current).toBeNull();

    // Flip back to authenticated: starts fetch B, which captures a NEW (later) session
    // snapshot — superseding A's. Must snap back to `undefined` (in-flight), not linger at
    // the previous `null` from the unauthenticated branch — otherwise the sidebar would
    // render fully unfiltered again during this window, reintroducing the
    // flash-of-full-menu-then-shrink bug.
    mockUseAuth.mockReturnValue(authState({ captureSession, isCurrentSession }));
    rerender();
    expect(result.current).toBeUndefined();
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
    mockUseAuth.mockReturnValue(authState());
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
