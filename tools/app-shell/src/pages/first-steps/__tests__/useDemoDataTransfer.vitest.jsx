import { act, renderHook, waitFor } from '@testing-library/react';

const SESSION = Object.freeze({ token: 'test-token' });
const authState = vi.hoisted(() => ({ value: null }));

vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => authState.value,
}));

import { useDemoDataTransfer } from '../useDemoDataTransfer.js';

const ENDPOINT = '/sws/go/demo-data-transfer';

function json(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

function httpError(status = 500) {
  return { ok: false, status, headers: { get: () => 'application/json' } };
}

beforeEach(() => {
  authState.value = SESSION;
  globalThis.fetch = vi.fn(async () => json({
    status: 'NOT_REQUESTED', products: {}, contacts: {},
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useDemoDataTransfer', () => {
  it('loads persisted progress and polls while the server job is running', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async () => json({
      status: 'RUNNING', products: { completed: 2, total: 5 }, contacts: { completed: 1, total: 4 },
    }));
    const { result } = renderHook(() => useDemoDataTransfer());

    await act(async () => { await Promise.resolve(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.products).toEqual({ completed: 2, total: 5 });
    expect(result.current.available).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining(ENDPOINT),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }));

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not schedule further polls once the persisted job is terminal', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async () => json({
      status: 'COMPLETED', products: { completed: 5, total: 5 }, contacts: { completed: 4, total: 4 },
    }));
    const { result } = renderHook(() => useDemoDataTransfer());

    await act(async () => { await Promise.resolve(); });
    expect(result.current.loading).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('degrades a failed status read to a visible error instead of holding First Steps loading', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('network unavailable'); });
    const { result } = renderHook(() => useDemoDataTransfer());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe('NOT_REQUESTED');
    expect(result.current.error).toBe(true);
    // Unknown is not "on": the row stays hidden rather than erroring for a feature that may be off.
    expect(result.current.available).toBe(false);
  });

  it('reads a 404 as flag demo-data-transfer OFF: unavailable, no error, no polling (ETP-5443)', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async () => httpError(404));
    const { result } = renderHook(() => useDemoDataTransfer());

    await act(async () => { await Promise.resolve(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.available).toBe(false);
    expect(result.current.error).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('posts a retry and replaces the state with the server projection', async () => {
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url).endsWith('/retry')) {
        expect(init).toMatchObject({ method: 'POST' });
        return json({ status: 'RUNNING', products: { completed: 3, total: 5 }, contacts: {} });
      }
      return json({ status: 'FAILED', products: {}, contacts: {} });
    });
    const { result } = renderHook(() => useDemoDataTransfer());
    await waitFor(() => expect(result.current.status).toBe('FAILED'));

    await act(async () => { await result.current.retry(); });
    expect(result.current.status).toBe('RUNNING');
    expect(result.current.products).toEqual({ completed: 3, total: 5 });
    expect(result.current.error).toBe(false);
  });

  it('rejects an unsuccessful retry so the page can show its error feedback', async () => {
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith('/retry')
      ? httpError(503) : json({ status: 'FAILED', products: {}, contacts: {} }));
    const { result } = renderHook(() => useDemoDataTransfer());
    await waitFor(() => expect(result.current.status).toBe('FAILED'));

    await expect(result.current.retry()).rejects.toThrow('HTTP 503');
    expect(result.current.status).toBe('FAILED');
  });
});
