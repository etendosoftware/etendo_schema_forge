import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { useNeoResource, getApiBase } from '../useNeoResource.js';

function okResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

describe('getApiBase', () => {
  it('strips the /web/... segment when the app is served under /etendo/web/', () => {
    setPathname('/etendo/web/app');
    expect(getApiBase()).toBe('/etendo');
  });

  it('returns an empty string (or env fallback) when /web/ is not in the path', () => {
    setPathname('/standalone/dashboard');
    expect(getApiBase()).toBe('');
  });
});

describe('useNeoResource', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in loading state and resolves with the inner response.data', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ items: [1, 2, 3] }));

    const { result } = renderHook(() =>
      useNeoResource({ path: '/sws/neo/foo', label: 'foo-hook' }),
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ items: [1, 2, 3] });
    expect(result.current.error).toBeNull();
  });

  it('builds the URL with the API base and sends the Bearer token', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ ok: true }));

    renderHook(() => useNeoResource({ path: '/sws/neo/foo' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/foo');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.signal).toBeDefined();
  });

  it('applies mapPayload to the raw response.data before exposing it', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ items: [{ id: '1' }, { id: '2' }] }));

    const { result } = renderHook(() =>
      useNeoResource({
        path: '/sws/neo/foo',
        mapPayload: (raw) => raw.items.length,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(2);
  });

  it('captures an error when the HTTP response is not ok', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useNeoResource({ path: '/sws/neo/foo' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('HTTP 500');
    expect(result.current.data).toBeNull();
  });

  it('captures an error when the response shape lacks response.data', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) });

    const { result } = renderHook(() => useNeoResource({ path: '/sws/neo/foo' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('Unexpected response shape');
  });

  it('stays idle when path is null (no fetch issued)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ x: 1 }));

    const { result } = renderHook(() => useNeoResource({ path: null }));

    // Give microtasks a tick to confirm no fetch was made
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it('refetches when reload() is called', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ x: 1 }));

    const { result } = renderHook(() => useNeoResource({ path: '/sws/neo/foo' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.reload();
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('refetches when deps change', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ x: 1 }));

    const { result, rerender } = renderHook(
      ({ id }) => useNeoResource({ path: `/sws/neo/foo?id=${id}`, deps: [id] }),
      { initialProps: { id: 'a' } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    rerender({ id: 'b' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

    const urls = globalThis.fetch.mock.calls.map((c) => c[0]);
    expect(urls[0]).toContain('id=a');
    expect(urls[1]).toContain('id=b');
  });

  it('swallows AbortError without setting state error', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    globalThis.fetch.mockRejectedValue(abort);

    const { result } = renderHook(() => useNeoResource({ path: '/sws/neo/foo' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });
});
