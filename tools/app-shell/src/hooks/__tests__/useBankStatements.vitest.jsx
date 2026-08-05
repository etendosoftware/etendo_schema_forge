/**
 * Tests for useBankStatements (GET via useNeoResource).
 *
 * ETP-4576 — the session is a server-side `__Host-` cookie, so the underlying
 * useNeoResource gates on `isAuthenticated` (never a client-held `token`), sends
 * no Authorization header, and must opt the request into cookie transport with
 * `credentials: 'include'`.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { setAuthMock, configureAuthMock } from '@/test/authContextMock.js';
import { expectNoAuthorizationHeader } from '@/test/sessionContract.js';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

configureAuthMock({ isAuthenticated: true });

import { useBankStatements } from '../useBankStatements.js';

function okResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

describe('useBankStatements', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    setAuthMock({ isAuthenticated: true });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch when accountId is null (returns empty + idle)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    const { result } = renderHook(() => useBankStatements(null));

    // Give microtasks a tick to confirm no fetch was issued.
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.statements).toEqual([]);
  });

  it('does not fetch when the user is not authenticated', async () => {
    setAuthMock({ isAuthenticated: false });
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    const { result } = renderHook(() => useBankStatements('acc-1'));

    // Give microtasks a tick to confirm no request escaped the gate.
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.statements).toEqual([]);
  });

  it('fetches the bank-statements endpoint with the accountId in the query string', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    renderHook(() => useBankStatements('acc-1'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?FIN_Financial_Account_ID=acc-1');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('authenticates with the session cookie, not a bearer token', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    renderHook(() => useBankStatements('acc-1'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [, init] = globalThis.fetch.mock.calls[0];
    // The `__Host-` session cookie only travels when the request opts in.
    expect(init.credentials).toBe('include');
    expectNoAuthorizationHeader();
  });

  it('URL-encodes the accountId so special characters survive transport', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    renderHook(() => useBankStatements('acc/with space'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('acc%2Fwith%20space');
  });

  it('exposes statements + loading false on successful response', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ statements: [{ id: 's1', documentNo: 'BS-001' }] }),
    );

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statements).toEqual([{ id: 's1', documentNo: 'BS-001' }]);
    expect(result.current.error).toBeNull();
  });

  it('returns an empty array when the API omits the statements key', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ unrelated: 'noise' }));

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statements).toEqual([]);
  });

  it('captures the error and keeps statements empty on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statements).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('HTTP 500');
  });

  it('captures the error when the network rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('Network down');
  });

  it('refetches when accountId changes', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    const { result, rerender } = renderHook(
      ({ id }) => useBankStatements(id),
      { initialProps: { id: 'acc-1' } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    rerender({ id: 'acc-2' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

    const urls = globalThis.fetch.mock.calls.map((c) => c[0]);
    expect(urls[0]).toContain('acc-1');
    expect(urls[1]).toContain('acc-2');
  });

  it('exposes reload() that re-issues the same request', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reload();
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
