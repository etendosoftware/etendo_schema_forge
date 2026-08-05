import { renderHook, waitFor } from '@testing-library/react';
import { expectNoAuthorizationHeader } from '@/test/sessionContract.js';

/**
 * ETP-4576 — the session is a server-side `__Host-` cookie, so every hook in
 * this module gates on `isAuthenticated` and sends no Authorization header.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke a hook more than once per render, and a
 * "once" override would decay to the default mid-render. Flipping the object is
 * also why the unauthenticated case below no longer needs the previous
 * vi.doMock + vi.resetModules + dynamic-reimport dance.
 */
let mockAuth = { isAuthenticated: true };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockAuth,
}));

import {
  useBPartnerLookup,
  useGLItemLookup,
  useOutstandingInvoices,
} from '../useMovementLookups.js';

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
    mockAuth = { isAuthenticated: true };
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
    expect(init.signal).toBeDefined();
    // ETP-4576 — the `__Host-` session cookie authenticates the request.
    expectNoAuthorizationHeader();

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

  it('does not fetch when the user is not authenticated', async () => {
    mockAuth = { isAuthenticated: false };

    globalThis.fetch.mockResolvedValue(okResponse({ bpartners: [] }));
    renderHook(() => useBPartnerLookup('hello'));

    // Wait past the debounce — no fetch should fire while unauthenticated.
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 100));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches when authenticated even though the client holds no token', async () => {
    // The cookie-session shape: authenticated, no client-held token.
    mockAuth = { isAuthenticated: true, token: null };
    globalThis.fetch.mockResolvedValue(
      okResponse({ bpartners: [{ id: 'bp-1', name: 'ACME' }] }),
    );

    const { result } = renderHook(() => useBPartnerLookup('acme'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled(), {
      timeout: DEBOUNCE_WAIT,
    });
    await waitFor(() =>
      expect(result.current.results).toEqual([{ id: 'bp-1', name: 'ACME' }]),
    );
    expectNoAuthorizationHeader();
  });
});

describe('useMovementLookups — useOutstandingInvoices', () => {
  beforeEach(() => {
    mockAuth = { isAuthenticated: true };
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the outstanding-invoices action without an Authorization header', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ invoices: [{ id: 'inv-1', no: 'F-1' }] }),
    );

    const { result } = renderHook(() => useOutstandingInvoices('bp-1', 'in'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('action=outstanding-invoices');
    expect(url).toContain('bpartnerId=bp-1');
    expect(result.current.invoices).toEqual([{ id: 'inv-1', no: 'F-1' }]);
    expectNoAuthorizationHeader();
  });

  it('returns an empty list and does not fetch when unauthenticated', async () => {
    mockAuth = { isAuthenticated: false };
    globalThis.fetch.mockResolvedValue(okResponse({ invoices: [{ id: 'inv-1' }] }));

    const { result } = renderHook(() => useOutstandingInvoices('bp-1', 'in'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.invoices).toEqual([]);
  });
});

describe('useMovementLookups — useGLItemLookup', () => {
  beforeEach(() => {
    mockAuth = { isAuthenticated: true };
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
