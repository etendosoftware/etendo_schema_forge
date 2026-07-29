// Behavioral coverage for DashboardDateRangeContext lives in schema_forge_core:
// packages/app-shell-core/src/components/dashboard/__tests__/DashboardDateRangeContext.vitest.jsx.
// This is a SHIM SMOKE TEST. The functional module is a re-export of the core
// context, so this file only verifies that the re-export RESOLVES and that the
// provider MOUNTS end-to-end through the real `@/` → package → core import
// chain. It does not re-test behavior: the core copy was byte-identical to this
// one, so every assertion it holds is already running there against the same
// code. What the core copy cannot cover is this resolution path.
import { render, screen } from '@testing-library/react';
import {
  DashboardDateRangeProvider,
  useDashboardDateRange,
  clearStoredDateRange,
} from '../DashboardDateRangeContext';

function Probe() {
  const ctx = useDashboardDateRange();
  return <span data-testid="range">{ctx.range}</span>;
}

describe('DashboardDateRangeContext shim', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('re-exports the members its consumers import', () => {
    expect(typeof DashboardDateRangeProvider).toBe('function');
    expect(typeof useDashboardDateRange).toBe('function');
    expect(typeof clearStoredDateRange).toBe('function');
  });

  it('mounts through the real core provider/import graph', () => {
    render(
      <DashboardDateRangeProvider>
        <Probe />
      </DashboardDateRangeProvider>,
    );

    // The provider resolved and supplied a range to its consumer.
    expect(screen.getByTestId('range').textContent).toBeTruthy();
  });
});
