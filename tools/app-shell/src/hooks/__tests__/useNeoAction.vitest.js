// Behavioral coverage for useNeoAction lives in schema_forge_core:
// packages/app-shell-core/src/hooks/__tests__/useNeoAction.vitest.js.
// This is a SHIM SMOKE TEST. The functional module is a re-export of the core
// hook, so this file only verifies that the re-export RESOLVES — both the named
// and the default export, since `export *` does not forward a default — and that
// the hook EXECUTES through the real `@/` → package → core import chain. It does
// not re-test behavior: the core copy was byte-identical to this one, so every
// assertion it holds is already running there against the same code. What the
// core copy cannot cover is this resolution path — that is what this file adds.
import { renderHook, act } from '@testing-library/react';
import useNeoActionDefault, { useNeoAction } from '../useNeoAction';

describe('useNeoAction shim', () => {
  const baseOpts = {
    specName: 'sales-order',
    entityName: 'header',
    apiBaseUrl: '/sws/neo/sales-order',
    token: 'test-token',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-exports the core hook as both named and default', () => {
    expect(typeof useNeoAction).toBe('function');
    expect(useNeoActionDefault).toBe(useNeoAction);
  });

  it('executes through the real core import graph', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useNeoAction(baseOpts));
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.execute('rec-1', 'post');
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/sales-order/header/rec-1/action/post',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
