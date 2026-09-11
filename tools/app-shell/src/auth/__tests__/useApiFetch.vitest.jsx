import { renderHook } from '@testing-library/react';

// ETP-5195 — useApiFetch() now forwards `apiSessionScope` from the session (read via the
// core's `useAuthOptional`) as createApiFetch's 4th argument. Spy on `createApiFetch` while
// spreading the rest of the module (mirrors src/hooks/__tests__/useBankStatements.vitest.jsx's
// established convention for mocking this core module), and stub `useAuthOptional` so each
// test controls the session shape.
const mockUseAuthOptional = vi.fn();
const mockCreateApiFetch = vi.fn();
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => mockUseAuthOptional(),
  createApiFetch: (...args) => mockCreateApiFetch(...args),
}));

const mockLogout = vi.fn();
vi.mock('@/auth/useLogout.js', () => ({
  useLogout: () => mockLogout,
}));

import { useApiFetch } from '../useApiFetch.js';

describe('useApiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateApiFetch.mockReturnValue(vi.fn());
  });

  it('forwards apiSessionScope as the 4th arg to createApiFetch when the session carries one', () => {
    mockUseAuthOptional.mockReturnValue({ token: 'tok-1', apiSessionScope: 'scope-1' });

    renderHook(() => useApiFetch('/api'));

    expect(mockCreateApiFetch).toHaveBeenCalledTimes(1);
    expect(mockCreateApiFetch).toHaveBeenCalledWith('/api', expect.any(Function), mockLogout, 'scope-1');
  });

  it('forwards undefined as the 4th arg when the session has no apiSessionScope', () => {
    // createApiFetch distinguishes null ("opt out of ambient inheritance") from undefined
    // ("inherit whatever scope is registered ambiently") — a session object that simply
    // doesn't carry apiSessionScope must produce undefined, not force an opt-out.
    mockUseAuthOptional.mockReturnValue({ token: 'tok-1' });

    renderHook(() => useApiFetch('/api'));

    expect(mockCreateApiFetch).toHaveBeenCalledWith('/api', expect.any(Function), mockLogout, undefined);
  });

  it('forwards undefined as the 4th arg when there is no session at all (ambient fallback)', () => {
    // ETP-5195 regression guard: this hook works without an AuthProvider above it (see its
    // own doc comment), falling back to the ambient session for both token AND scope. Forcing
    // null here would silently disable the stale-request guard for every call site that only
    // has the ambient session, not a local one -- undefined lets createApiFetch inherit
    // whatever scope is registered ambiently, matching the core hook's own contract exactly.
    mockUseAuthOptional.mockReturnValue(null);

    renderHook(() => useApiFetch());

    expect(mockCreateApiFetch).toHaveBeenCalledWith(undefined, expect.any(Function), mockLogout, undefined);
  });

  it('recomputes (calls createApiFetch again) when apiSessionScope changes between renders', () => {
    mockUseAuthOptional.mockReturnValue({ token: 'tok-1', apiSessionScope: 'scope-1' });
    const { rerender } = renderHook(() => useApiFetch('/api'));
    expect(mockCreateApiFetch).toHaveBeenCalledTimes(1);

    mockUseAuthOptional.mockReturnValue({ token: 'tok-1', apiSessionScope: 'scope-2' });
    rerender();

    expect(mockCreateApiFetch).toHaveBeenCalledTimes(2);
    expect(mockCreateApiFetch).toHaveBeenLastCalledWith('/api', expect.any(Function), mockLogout, 'scope-2');
  });
});
