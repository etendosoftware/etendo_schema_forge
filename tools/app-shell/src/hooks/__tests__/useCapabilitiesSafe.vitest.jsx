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
 */
import { render, screen } from '@testing-library/react';
import { useCapabilitiesSafe } from '../useCapabilitiesSafe.js';

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
});
