/**
 * Tests for useBatch — covers where the batch endpoint resolves to (ETP-5371) and the runBatch
 * POST flow (success, non-ok with body, non-ok without body, fetch rejection) with mocked fetch.
 */

import { renderHook, act } from '@testing-library/react';
import { useBatch } from '../useBatch.js';

describe('useBatch — batchUrl', () => {
  const originalLocation = window.location;

  function setPathname(pathname) {
    Object.defineProperty(window, 'location', { value: { pathname }, writable: true, configurable: true });
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
    delete import.meta.env.VITE_API_BASE;
    vi.restoreAllMocks();
  });

  function mockOkFetch() {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"committed":true}',
    });
  }

  it('posts to /batch at the NEO root', async () => {
    mockOkFetch();
    const { result } = renderHook(() => useBatch({ token: 'tok' }));

    await act(async () => {
      await result.current.runBatch([]);
    });

    expect(globalThis.fetch.mock.calls[0][0]).toBe('/sws/neo/batch');
  });

  /**
   * ETP-5371 — this hook used to derive the NEO root by stripping the last segment off the
   * caller's own `apiBaseUrl`, which worked only because `ListView` happens to be handed a
   * spec URL. The First Steps checklist passed the deployment prefix (`/etendo`), the chop
   * produced `''`, and the POST went to `/batch` — outside the backend entirely, where
   * CloudFront answered 403 and the failure read like an infrastructure outage.
   *
   * The hook no longer accepts `apiBaseUrl` at all, so the test passes one anyway: whatever a
   * caller hands it, the batch URL must keep the deployment's context path.
   */
  it('regression: keeps the deployment context path no matter what the caller passes', async () => {
    import.meta.env.VITE_API_BASE = '/etendo';
    setPathname('/first-steps');
    mockOkFetch();

    const { result } = renderHook(() => useBatch({ apiBaseUrl: '/etendo', token: 'tok' }));

    await act(async () => {
      await result.current.runBatch([]);
    });

    expect(globalThis.fetch.mock.calls[0][0]).toBe('/etendo/sws/neo/batch');
  });

  it('sends the Products window and the First Steps checklist to the same endpoint', async () => {
    import.meta.env.VITE_API_BASE = '/etendo';
    setPathname('/first-steps');
    mockOkFetch();

    // The two shapes the two entry points used to pass in.
    const fromListView = renderHook(() => useBatch({ apiBaseUrl: '/etendo/sws/neo/product', token: 'tok' }));
    const fromFirstSteps = renderHook(() => useBatch({ apiBaseUrl: '/etendo', token: 'tok' }));

    await act(async () => {
      await fromListView.result.current.runBatch([]);
      await fromFirstSteps.result.current.runBatch([]);
    });

    const [listViewUrl] = globalThis.fetch.mock.calls[0];
    const [firstStepsUrl] = globalThis.fetch.mock.calls[1];
    expect(firstStepsUrl).toBe(listViewUrl);
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

  it('sends a POST with { operations } body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    const { result } = renderHook(() => useBatch({ token: 'my-token' }));

    const ops = [{ id: 'op1', spec: 'product' }];
    await act(async () => {
      await result.current.runBatch(ops);
    });

    // Auth/Content-Type headers are now `useApiFetch`'s responsibility, covered
    // by its own tests — this hook only owns the method + body it sends.
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/sws/neo/batch');
    expect(opts.method).toBe('POST');
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

  it('regression: preserves the raw response text on the thrown error (a genuinely uncontrolled failure, e.g. a stack trace or gateway error page)', async () => {
    // A non-ok response whose body isn't even valid JSON has nothing else worth
    // inspecting besides its raw text — without this, the import UI's system-error
    // dialog would have nothing to show beyond the generic "Batch failed (502)".
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'Gateway error: upstream connection reset\n  at some.internal.Handler',
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

    expect(error.raw).toBe('Gateway error: upstream connection reset\n  at some.internal.Handler');
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
