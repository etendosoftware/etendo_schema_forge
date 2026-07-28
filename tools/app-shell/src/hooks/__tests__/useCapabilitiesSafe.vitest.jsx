/**
 * ETP-4520 — `useCapabilitiesSafe` hook coverage.
 *
 * `@/auth/AuthContext.jsx` is mocked directly so the three real-world shapes
 * of `useAuth()` can be exercised deterministically, independent of whether
 * the published `@etendosoftware/app-shell-core` package (no windowAccess/
 * capabilities support yet) or the LOCAL_CORE source is resolved:
 *   - no `AuthProvider` ancestor → `useAuth()` throws (its real contract)
 *   - `AuthProvider` present, capabilities loaded → returns the map
 *   - `AuthProvider` present, capabilities not yet loaded (undefined) → {}
 *   - `useAuth()` throws a DIFFERENT error → must propagate, not be swallowed
 */
import { render, screen } from '@testing-library/react';
import { useCapabilitiesSafe } from '../useCapabilitiesSafe.js';

// Suppress React's noisy console.error for the intentional-throw test below —
// React logs the error boundary-less render error in addition to it
// propagating, which is expected here and not itself under test.
const originalConsoleError = console.error;

const mockUseAuth = vi.fn();
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
}));

function Probe() {
  const capabilities = useCapabilitiesSafe();
  return <div data-testid="probe">{JSON.stringify(capabilities)}</div>;
}

describe('useCapabilitiesSafe', () => {
  it('returns {} when useAuth() throws (no AuthProvider ancestor)', () => {
    mockUseAuth.mockImplementation(() => {
      throw new Error('useAuth must be used within AuthProvider');
    });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('{}');
  });

  it('returns the loaded capabilities map', () => {
    mockUseAuth.mockReturnValue({ capabilities: { showAccountingFields: true } });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent(JSON.stringify({ showAccountingFields: true }));
  });

  it('returns {} when capabilities has not loaded yet (undefined)', () => {
    mockUseAuth.mockReturnValue({ capabilities: undefined });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('{}');
  });

  it('rethrows an unrelated error instead of swallowing it', () => {
    // eslint-disable-next-line no-console -- expected React render-error log, silenced deliberately for this test
    console.error = vi.fn();
    try {
      mockUseAuth.mockImplementation(() => {
        throw new Error('some unrelated AuthContext bug');
      });
      expect(() => render(<Probe />)).toThrow('some unrelated AuthContext bug');
    } finally {
      console.error = originalConsoleError;
    }
  });

  // ETP-4520 — referential stability: callers (e.g. DataTable.jsx) put the
  // returned capabilities object in useMemo/useCallback dependency arrays. A
  // fresh `{}` literal on every fallback call would defeat that memoization
  // even when nothing changed. useAuth() is mocked as a plain function here
  // (no real hook internals), so useCapabilitiesSafe() can be called directly
  // without a component render to compare references across calls.
  describe('referential stability across calls', () => {
    it('returns the same object reference when capabilities is undefined', () => {
      mockUseAuth.mockReturnValue({ capabilities: undefined });
      const first = useCapabilitiesSafe();
      const second = useCapabilitiesSafe();
      expect(first).toBe(second);
    });

    it('returns the same object reference when useAuth() throws', () => {
      mockUseAuth.mockImplementation(() => {
        throw new Error('useAuth must be used within AuthProvider');
      });
      const first = useCapabilitiesSafe();
      const second = useCapabilitiesSafe();
      expect(first).toBe(second);
    });

    it('returns the same reference from the undefined path and the throw path', () => {
      mockUseAuth.mockReturnValue({ capabilities: undefined });
      const fromUndefined = useCapabilitiesSafe();
      mockUseAuth.mockImplementation(() => {
        throw new Error('useAuth must be used within AuthProvider');
      });
      const fromThrow = useCapabilitiesSafe();
      expect(fromUndefined).toBe(fromThrow);
    });
  });
});
