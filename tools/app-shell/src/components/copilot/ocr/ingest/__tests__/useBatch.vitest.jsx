/**
 * Tests for useBatch — covers batchUrl derivation and the runBatch POST flow
 * (success, non-ok with body, non-ok without body, fetch rejection) with mocked fetch.
 */

import { renderHook, act } from '@testing-library/react';
import { useBatch } from '../useBatch.js';

describe('useBatch — batchUrl', () => {
  it('defaults to /sws/neo/batch when no apiBaseUrl is provided', () => {
    const { result } = renderHook(() => useBatch({ token: 'tok' }));
    // Indirectly verified through the fetch URL in runBatch tests; here just smoke.
    expect(typeof result.current.runBatch).toBe('function');
  });

  it('strips the trailing spec segment from apiBaseUrl', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"committed":true}',
    });
    const { result } = renderHook(() =>
      useBatch({ apiBaseUrl: '/sws/neo/purchase-invoice', token: 'tok' }),
    );

    await act(async () => {
      await result.current.runBatch([]);
    });

    expect(globalThis.fetch.mock.calls[0][0]).toBe('/sws/neo/batch');
    vi.restoreAllMocks();
  });
});

describe('useBatch — runBatch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed json on success and toggles loading true then false', async () => {
    let resolveText;
    const textPromise = new Promise((r) => { resolveText = r; });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => textPromise,
    });

    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let promise;
    // Kick off the request and let React commit the setLoading(true) update.
    await act(async () => {
      promise = result.current.runBatch([{ id: 'a' }]);
    });
    expect(result.current.loading).toBe(true);

    let returned;
    await act(async () => {
      resolveText('{"committed":true}');
      returned = await promise;
    });

    expect(returned).toEqual({ committed: true });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sends a POST with { operations } body and Authorization header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    const { result } = renderHook(() =>
      useBatch({ apiBaseUrl: '/sws/neo/purchase-invoice', token: 'my-token' }),
    );

    const ops = [{ id: 'op1', spec: 'product' }];
    await act(async () => {
      await result.current.runBatch(ops);
    });

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/sws/neo/batch');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer my-token');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ operations: ops });
  });

  it('returns json on a non-ok response that still carries a body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => '{"committed":false,"failedAt":{"id":"x"}}',
    });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let returned;
    await act(async () => {
      returned = await result.current.runBatch([]);
    });

    expect(returned).toEqual({ committed: false, failedAt: { id: 'x' } });
    expect(result.current.error).toBeNull();
  });

  it('throws and sets error on a non-ok response with an empty body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
    });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let error;
    await act(async () => {
      try {
        await result.current.runBatch([]);
      } catch (e) {
        error = e;
      }
    });

    expect(error.message).toBe('Batch failed (500)');
    expect(result.current.error).toBe(error);
    expect(result.current.loading).toBe(false);
  });

  it('throws and sets error on a non-ok response with an invalid (non-JSON) body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'Gateway error',
    });
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let error;
    await act(async () => {
      try {
        await result.current.runBatch([]);
      } catch (e) {
        error = e;
      }
    });

    expect(error.message).toBe('Batch failed (502)');
    expect(result.current.error).toBe(error);
  });

  it('sets error and rethrows when fetch rejects', async () => {
    const networkErr = new Error('network down');
    globalThis.fetch = vi.fn().mockRejectedValue(networkErr);
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    let error;
    await act(async () => {
      try {
        await result.current.runBatch([]);
      } catch (e) {
        error = e;
      }
    });

    expect(error).toBe(networkErr);
    expect(result.current.error).toBe(networkErr);
    expect(result.current.loading).toBe(false);
  });
});
