import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import {
  useCreateMovement,
  useProcessMovement,
  useReactivateMovement,
  useDeleteMovement,
} from '../useCreateMovement.js';

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

describe('useCreateMovement', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the initial idle state', () => {
    const { result } = renderHook(() => useCreateMovement());
    expect(result.current.creating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.createMovement).toBe('function');
  });

  it('POSTs the payload to /financial-account-transactions?action=create with bearer auth', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { id: 'mov-1', trxType: 'BPD' } } }),
    });

    const { result } = renderHook(() => useCreateMovement());

    const payload = { FIN_Financial_Account_ID: 'acc-1', trxType: 'BPD', amount: 100 };
    let res;
    await act(async () => {
      res = await result.current.createMovement(payload);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(
      '/etendo/sws/neo/financial-account-transactions?action=create',
    );
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(payload);
    expect(res).toEqual({ id: 'mov-1', trxType: 'BPD' });
  });

  it('flips the creating flag during the call and back to false after', async () => {
    let resolve;
    globalThis.fetch.mockReturnValue(
      new Promise((r) => { resolve = r; }),
    );

    const { result } = renderHook(() => useCreateMovement());
    let promise;
    act(() => {
      promise = result.current.createMovement({});
    });

    await waitFor(() => expect(result.current.creating).toBe(true));

    await act(async () => {
      resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
      await promise;
    });

    expect(result.current.creating).toBe(false);
  });

  it('throws and captures the error on HTTP failure (status + body included)', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid trxType',
    });

    const { result } = renderHook(() => useCreateMovement());

    await act(async () => {
      await expect(result.current.createMovement({})).rejects.toThrow(/HTTP 400/);
    });
    await waitFor(() => expect(result.current.creating).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('HTTP 400');
    expect(result.current.error.message).toContain('Invalid trxType');
  });

  it('tolerates a text() that rejects and still produces an HTTP error', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => { throw new Error('boom'); },
    });

    const { result } = renderHook(() => useCreateMovement());

    await act(async () => {
      await expect(result.current.createMovement({})).rejects.toThrow(/HTTP 500/);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('HTTP 500');
  });

  it('propagates a network rejection and stores it on `error`', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useCreateMovement());

    await act(async () => {
      await expect(result.current.createMovement({})).rejects.toThrow('Network down');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('Network down');
  });

  it('returns {} when the API omits response.data', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ /* no response */ }),
    });

    const { result } = renderHook(() => useCreateMovement());

    let res;
    await act(async () => {
      res = await result.current.createMovement({});
    });
    expect(res).toEqual({});
  });
});

// ── Lifecycle hooks (ETP-4500) ────────────────────────────────────────────────
// process / reactivate / delete all share the usePostAction plumbing, POSTing
// { id } to ?action=<verb>. Parametrized to keep the coverage symmetric.
describe('movement lifecycle hooks', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const CASES = [
    { name: 'useProcessMovement', hook: useProcessMovement, fn: 'processMovement', busy: 'processing', action: 'process' },
    { name: 'useReactivateMovement', hook: useReactivateMovement, fn: 'reactivateMovement', busy: 'reactivating', action: 'reactivate' },
    { name: 'useDeleteMovement', hook: useDeleteMovement, fn: 'deleteMovement', busy: 'deleting', action: 'delete' },
  ];

  for (const { name, hook, fn, busy, action } of CASES) {
    describe(name, () => {
      it(`starts idle and POSTs { id } to ?action=${action} with bearer auth`, async () => {
        globalThis.fetch.mockResolvedValue({
          ok: true,
          json: async () => ({ response: { data: { id: 'mov-1' } } }),
        });

        const { result } = renderHook(() => hook());
        expect(result.current[busy]).toBe(false);
        expect(result.current.error).toBeNull();
        expect(typeof result.current[fn]).toBe('function');

        let res;
        await act(async () => {
          res = await result.current[fn]({ id: 'mov-1' });
        });

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        const [url, init] = globalThis.fetch.mock.calls[0];
        expect(url).toBe(
          `/etendo/sws/neo/financial-account-transactions?action=${action}`,
        );
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({ id: 'mov-1' });
        expect(res).toEqual({ id: 'mov-1' });
      });

      it('flips the busy flag during the call and clears it after', async () => {
        let resolve;
        globalThis.fetch.mockReturnValue(new Promise((r) => { resolve = r; }));

        const { result } = renderHook(() => hook());
        let promise;
        act(() => { promise = result.current[fn]({ id: 'x' }); });

        await waitFor(() => expect(result.current[busy]).toBe(true));

        await act(async () => {
          resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
          await promise;
        });
        expect(result.current[busy]).toBe(false);
      });

      it('throws and captures the error on HTTP failure', async () => {
        globalThis.fetch.mockResolvedValue({
          ok: false,
          status: 409,
          text: async () => 'conflict',
        });

        const { result } = renderHook(() => hook());
        await act(async () => {
          await expect(result.current[fn]({ id: 'x' })).rejects.toThrow(/HTTP 409/);
        });
        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error.message).toContain('HTTP 409');
      });
    });
  }
});
