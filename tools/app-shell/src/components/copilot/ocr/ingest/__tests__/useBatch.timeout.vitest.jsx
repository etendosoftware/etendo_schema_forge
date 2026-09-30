/**
 * ETP-5424 — `runBatch` is the import's send (`useWindowImportDialog` hands it to the import
 * engine as `postBatch`). One `/batch` POST is a single transaction over many operations, and
 * the server can legitimately take longer than apiFetch's default timeout. A client-side cut
 * would report the rows as failed while the transaction may still commit — the duplicate the
 * import engine's `importErrorTimeout` wording warns about — so the send opts out: `timeout: 0`.
 *
 * `useApiFetch` is wrapped (not replaced) so the options can be asserted while the real client
 * still performs the request.
 */
import { renderHook, act } from '@testing-library/react';

const { apiFetchCalls } = vi.hoisted(() => ({ apiFetchCalls: [] }));

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const actual = await importOriginal();
  const wrapped = new WeakMap();
  return {
    ...actual,
    useApiFetch: (baseUrl) => {
      const real = actual.useApiFetch(baseUrl);
      if (!wrapped.has(real)) {
        wrapped.set(real, (path, options = {}) => {
          apiFetchCalls.push({ path, options });
          return real(path, options);
        });
      }
      return wrapped.get(real);
    },
  };
});

import { useBatch } from '../useBatch.js';

describe('useBatch — timeout opt-out (ETP-5424)', () => {
  beforeEach(() => {
    apiFetchCalls.length = 0;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"committed":true}',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes timeout: 0 on the /batch POST', async () => {
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    await act(async () => {
      await result.current.runBatch([{ id: 'op1', spec: 'product', entity: 'product', body: {} }]);
    });

    const batchCall = apiFetchCalls.find(({ path }) => String(path).endsWith('/batch'));
    expect(batchCall, 'expected runBatch to call apiFetch on /batch').toBeTruthy();
    expect(batchCall.options.method).toBe('POST');
    expect(batchCall.options.timeout).toBe(0);
  });
});
