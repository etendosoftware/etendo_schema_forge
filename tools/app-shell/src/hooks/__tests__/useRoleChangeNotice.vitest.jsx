import { renderHook, act } from '@testing-library/react';

// ETP-5189 — useRoleChangeNotice() consumes useAuth() for isSessionReady/accessLoaded plus the
// three access-shape objects (windowAccess/capabilities/menuAccess) whose OBJECT REFERENCE it
// diffs against a captured baseline. Mock useAuth so each test controls exactly which references
// are handed back across re-renders — mirrors useViewerRole.vitest.jsx / useRoleMenu.vitest.jsx's
// own mocking convention.
const mockUseAuth = vi.fn();
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
}));

import { useRoleChangeNotice } from '../useRoleChangeNotice.js';

function authState(overrides = {}) {
  return {
    isSessionReady: true,
    accessLoaded: true,
    windowAccess: { win: true },
    capabilities: { cap: true },
    menuAccess: { menu: true },
    ...overrides,
  };
}

describe('useRoleChangeNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false on first render even when isSessionReady && accessLoaded are both true (first settle = baseline)', () => {
    mockUseAuth.mockReturnValue(authState());

    const { result } = renderHook(() => useRoleChangeNotice());

    expect(result.current.changed).toBe(false);
  });

  it('returns false while isSessionReady is false, regardless of the access objects', () => {
    mockUseAuth.mockReturnValue(authState({ isSessionReady: false }));

    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false);

    // Even swapping every access reference while not-ready must not flag a change —
    // the effect bails out before capturing/comparing a baseline at all.
    mockUseAuth.mockReturnValue(
      authState({ isSessionReady: false, windowAccess: { win: 'new' }, capabilities: { cap: 'new' }, menuAccess: { menu: 'new' } }),
    );
    rerender();

    expect(result.current.changed).toBe(false);
  });

  it('returns false while accessLoaded is false, regardless of the access objects', () => {
    mockUseAuth.mockReturnValue(authState({ accessLoaded: false }));

    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false);

    mockUseAuth.mockReturnValue(
      authState({ accessLoaded: false, windowAccess: { win: 'new' }, capabilities: { cap: 'new' }, menuAccess: { menu: 'new' } }),
    );
    rerender();

    expect(result.current.changed).toBe(false);
  });

  it('returns true after a re-render where windowAccess becomes a new reference (deep-equal content still flags true)', () => {
    mockUseAuth.mockReturnValue(authState());
    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false); // baseline captured

    // Fresh object, same content — reference-based diff must still flag this, since this is
    // exactly what AuthContext.jsx's real access-diff produces on an actual role change.
    mockUseAuth.mockReturnValue(authState({ windowAccess: { win: true } }));
    rerender();

    expect(result.current.changed).toBe(true);
  });

  it('returns true after a re-render where only capabilities changes reference (others unchanged)', () => {
    const base = authState();
    mockUseAuth.mockReturnValue(base);
    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false);

    mockUseAuth.mockReturnValue({ ...base, capabilities: { cap: 'changed' } });
    rerender();

    expect(result.current.changed).toBe(true);
  });

  it('returns true after a re-render where only menuAccess changes reference (ETP-5189: menu/process-only grant change must still notify)', () => {
    const base = authState();
    mockUseAuth.mockReturnValue(base);
    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false);

    mockUseAuth.mockReturnValue({ ...base, menuAccess: { menu: 'changed' } });
    rerender();

    expect(result.current.changed).toBe(true);
  });

  it('stays false across a re-render where none of the three references change (pure token rotation — metadataUnchanged case)', () => {
    const base = authState();
    mockUseAuth.mockReturnValue(base);
    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false);

    // Simulate AuthContext.jsx's metadataUnchanged branch: authRevision-style settle re-fires
    // with the EXACT SAME windowAccess/capabilities/menuAccess instances (only isSessionReady/
    // accessLoaded re-assert as true). Must NOT flag a change.
    mockUseAuth.mockReturnValue({ ...base });
    rerender();

    expect(result.current.changed).toBe(false);
  });

  it('once flagged true, stays true on a further re-render where nothing else changes', () => {
    const base = authState();
    mockUseAuth.mockReturnValue(base);
    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false);

    const changed = { ...base, windowAccess: { win: 'changed' } };
    mockUseAuth.mockReturnValue(changed);
    rerender();
    expect(result.current.changed).toBe(true);

    // Re-render again reusing the exact same (now-baseline) references — no further diff.
    mockUseAuth.mockReturnValue(changed);
    rerender();

    expect(result.current.changed).toBe(true);
  });

  it('dismiss() resets changed back to false after it was flagged true', () => {
    const base = authState();
    mockUseAuth.mockReturnValue(base);
    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false);

    mockUseAuth.mockReturnValue({ ...base, windowAccess: { win: 'changed' } });
    rerender();
    expect(result.current.changed).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.changed).toBe(false);
  });

  it('re-flags true on a SUBSEQUENT genuine reference change after a dismiss (dismiss does not permanently suppress future real changes)', () => {
    const base = authState();
    mockUseAuth.mockReturnValue(base);
    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false);

    const firstChange = { ...base, windowAccess: { win: 'changed-once' } };
    mockUseAuth.mockReturnValue(firstChange);
    rerender();
    expect(result.current.changed).toBe(true);

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.changed).toBe(false);

    // A second, genuinely new reference change — baseline.current was already updated to
    // firstChange's triple, so this must be diffed against that (correct) prior state and
    // re-flag, proving dismiss() doesn't suppress later real changes.
    mockUseAuth.mockReturnValue({ ...firstChange, windowAccess: { win: 'changed-twice' } });
    rerender();

    expect(result.current.changed).toBe(true);
  });

  it('stays false after a dismiss on a re-render with no further reference change (no spurious re-flag on a no-op render)', () => {
    const base = authState();
    mockUseAuth.mockReturnValue(base);
    const { result, rerender } = renderHook(() => useRoleChangeNotice());
    expect(result.current.changed).toBe(false);

    const firstChange = { ...base, windowAccess: { win: 'changed-once' } };
    mockUseAuth.mockReturnValue(firstChange);
    rerender();
    expect(result.current.changed).toBe(true);

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.changed).toBe(false);

    // Re-render again reusing the exact same (now-baseline) references — no diff at all.
    mockUseAuth.mockReturnValue(firstChange);
    rerender();

    expect(result.current.changed).toBe(false);
  });
});
