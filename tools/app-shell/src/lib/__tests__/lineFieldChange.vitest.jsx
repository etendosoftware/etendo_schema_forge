// Behavioral coverage for lineFieldChange lives in schema_forge_core:
// packages/app-shell-core/src/lib/__tests__/lineFieldChange.vitest.jsx.
// This is a SHIM SMOKE TEST. The functional module is a re-export of the core
// helpers, so this file only verifies that the re-export RESOLVES and that a
// helper EXECUTES through the real `@/` → package → core import chain. It does
// not re-test behavior: the core copy was byte-identical to this one, so every
// assertion it holds is already running there against the same code. What the
// core copy cannot cover is this resolution path — that is what this file adds.
import { roundAmounts } from '../lineFieldChange';

describe('lineFieldChange shim', () => {
  it('re-exports the helper its consumers import', () => {
    // DetailView imports only roundAmounts from this module.
    expect(typeof roundAmounts).toBe('function');
  });

  it('executes through the real core import graph', () => {
    const result = { lineNetAmount: 10.005, lineGrossAmount: 12.1049, other: 1.239 };
    roundAmounts(result);

    expect(result.lineNetAmount).toBe(10.01);
    expect(result.lineGrossAmount).toBe(12.1);
    // Untracked keys are left alone.
    expect(result.other).toBe(1.239);
  });
});
