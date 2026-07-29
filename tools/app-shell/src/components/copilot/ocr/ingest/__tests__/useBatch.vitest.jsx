// Behavioral coverage for useBatch lives in schema_forge_core:
// packages/app-shell-core/src/components/copilot/ocr/ingest/__tests__/useBatch.vitest.jsx.
// This is a SHIM SMOKE TEST. The functional module is a re-export of the core
// hook, so this file only verifies that the re-export RESOLVES — both the named
// and the default export, since `export *` does not forward a default — and that
// the hook EXECUTES through the real `@/` → package → core import chain. It does
// not re-test behavior: the core copy was byte-identical to this one, so every
// assertion it holds is already running there against the same code. What the
// core copy cannot cover is this resolution path — that is what this file adds.
import { renderHook, act } from '@testing-library/react';
import useBatchDefault, { useBatch } from '../useBatch.js';

describe('useBatch shim', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-exports the core hook as both named and default', () => {
    expect(typeof useBatch).toBe('function');
    expect(useBatchDefault).toBe(useBatch);
  });

  it('executes through the real core import graph', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"committed":true}',
    });

    const { result } = renderHook(() =>
      useBatch({ apiBaseUrl: '/sws/neo/purchase-invoice', token: 'tok' }),
    );
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.runBatch([]);
    });

    // The /batch endpoint lives at the NEO root, so the host spec segment is stripped.
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/batch',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
