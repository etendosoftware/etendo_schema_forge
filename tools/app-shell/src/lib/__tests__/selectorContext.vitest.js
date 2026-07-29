// Behavioral coverage for selectorContext lives in schema_forge_core:
// packages/app-shell-core/src/lib/__tests__/selectorContext.vitest.js.
// This is a SHIM SMOKE TEST. The functional module is a re-export of the core
// helpers, so this file only verifies that the re-export RESOLVES and that the
// helpers EXECUTE through the real `@/` → package → core import chain. It does
// not re-test behavior: the core copy was byte-identical to this one, so every
// assertion it holds is already running there against the same code. What the
// core copy cannot cover is this resolution path — that is what this file adds.
import { describe, it, expect } from 'vitest';
import { buildHeaderSelectorContext, buildLineSelectorContext } from '../selectorContext.js';

describe('selectorContext shim', () => {
  it('re-exports the helpers its consumers import', () => {
    // DetailView imports exactly these two builders from this module.
    expect(typeof buildHeaderSelectorContext).toBe('function');
    expect(typeof buildLineSelectorContext).toBe('function');
  });

  it('executes through the real core import graph', () => {
    expect(buildHeaderSelectorContext('sales')).toMatchObject({ isSOTrx: 'Y' });

    expect(buildLineSelectorContext({ windowCategory: 'purchases', parentId: 'hdr-1' }))
      .toMatchObject({ parentId: 'hdr-1', isSOTrx: 'N', IsSOTrx: 'N' });
  });
});
