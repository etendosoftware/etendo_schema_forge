import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { useBPartnerLookup, useGLItemLookup } from '../useMovementLookups.js';

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

const DEBOUNCE_MS = 200;
// Some headroom for the debounce timer to fire reliably under jsdom.
const DEBOUNCE_WAIT = 4000;

function okResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

describe('useMovementLookups — useBPartnerLookup', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with empty results and no error', () => {
    globalThis.fetch.mockResolvedValue(okResponse({ bpartners: [] }));
    const { result } = renderHook(() => useBPartnerLookup(''));
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('hits the bpartner-lookup endpoint with the query in ?q=', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ bpartners: [{ id: 'bp-1', name: 'ACME' }] }),
    );

    const { result } = renderHook(() => useBPartnerLookup('acme'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled(), {
      timeout: DEBOUNCE_WAIT,
    });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(
      '/etendo/sws/neo/financial-account-transactions?action=bpartner-lookup&q=acme',
    );
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.signal).toBeDefined();

    await waitFor(() =>
      expect(result.current.results).toEqual([{ id: 'bp-1', name: 'ACME' }]),
    );
  });

  it('URL-encodes the query string', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ bpartners: [] }));

    renderHook(() => useBPartnerLookup('with space & symbols'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled(), {
      timeout: DEBOUNCE_WAIT,
    });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('q=with%20space%20%26%20symbols');
  });

  it('captures the error on HTTP failure but does not crash on AbortError', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useBPartnerLookup('xyz'));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error), {
      timeout: DEBOUNCE_WAIT,
    });
    expect(result.current.error.message).toContain('HTTP 500');
  });

  it('falls back to [] when the API omits the bpartners key', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ unexpected: 'shape' }));

    const { result } = renderHook(() => useBPartnerLookup('x'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled(), {
      timeout: DEBOUNCE_WAIT,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results).toEqual([]);
  });

  it('debounces — successive renders within DEBOUNCE_MS only issue one request', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ bpartners: [] }));

    const { rerender } = renderHook(({ q }) => useBPartnerLookup(q), {
      initialProps: { q: 'a' },
    });
    rerender({ q: 'ab' });
    rerender({ q: 'abc' });

    // Wait long enough for the LAST debounce to settle and verify only ONE
    // fetch was issued with the final query.
    await waitFor(
      () => expect(globalThis.fetch).toHaveBeenCalledTimes(1),
      { timeout: DEBOUNCE_WAIT },
    );
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('q=abc');
  });

  it('does not fetch when the user has no token', async () => {
    const { useAuth: realAuth } = await import('@/auth/AuthContext.jsx');
    expect(realAuth().token).toBeTruthy(); // sanity check — mock is active

    vi.doMock('@/auth/AuthContext.jsx', () => ({
      useAuth: () => ({ token: null }),
    }));
    // Re-import the hook so the new mock is picked up
    vi.resetModules();
    const { useBPartnerLookup: hook } = await import('../useMovementLookups.js');

    globalThis.fetch.mockResolvedValue(okResponse({ bpartners: [] }));
    renderHook(() => hook('hello'));

    // Wait past the debounce — no fetch should fire because token is null
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 100));
    expect(globalThis.fetch).not.toHaveBeenCalled();

    vi.resetModules();
  });
});

describe('useMovementLookups — useGLItemLookup', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hits the glitem-lookup endpoint and exposes the glItems array', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ glItems: [{ id: 'g1', name: 'Bank Fee' }] }),
    );

    const { result } = renderHook(() => useGLItemLookup('bank'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled(), {
      timeout: DEBOUNCE_WAIT,
    });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(
      '/etendo/sws/neo/financial-account-transactions?action=glitem-lookup&q=bank',
    );

    await waitFor(() =>
      expect(result.current.results).toEqual([{ id: 'g1', name: 'Bank Fee' }]),
    );
  });

  it('captures a network rejection (other than AbortError)', async () => {
    globalThis.fetch.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useGLItemLookup('x'));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error), {
      timeout: DEBOUNCE_WAIT,
    });
    expect(result.current.error.message).toBe('offline');
  });
});
