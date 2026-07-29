// Behavioral coverage for useDisplayLogic lives in schema_forge_core:
// packages/app-shell-core/src/hooks/__tests__/useDisplayLogic.vitest.jsx.
// This is a SHIM SMOKE TEST. The functional module is a re-export of the core
// hook, so this file only verifies that the re-export RESOLVES and that the hook
// EXECUTES through the real `@/` → package → core import chain. It does not
// re-test behavior: the core copy was byte-identical to this one, so every
// assertion it holds is already running there against the same code. What the
// core copy cannot cover is this resolution path — that is what this file adds.
import { renderHook } from '@testing-library/react';
import { useDisplayLogic } from '../useDisplayLogic';

describe('useDisplayLogic shim', () => {
  it('re-exports the core hook', () => {
    expect(typeof useDisplayLogic).toBe('function');
  });

  it('executes through the real core import graph', () => {
    const { result } = renderHook(() =>
      useDisplayLogic('header', { id: '1' }, {
        token: 'test-token',
        apiBaseUrl: 'http://localhost/api',
      }),
    );

    expect(result.current).toEqual({ readOnly: {}, visibility: {} });
  });
});
