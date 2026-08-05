/**
 * Functional boundary test for useDistinctValues.
 *
 * NOTE on the previous version of this comment: it described `@/hooks/
 * useDistinctValues.js` as a thin re-export shim over
 * `@etendosoftware/app-shell-core/hooks/useDistinctValues.js`. That is NOT true
 * on this branch — this repo ships its OWN full implementation of the hook, which
 * happens to duplicate core's copy. So the `@/auth` alias DOES intercept the
 * hook's `useAuth` import, and mocking it would work. We keep the real
 * AuthProvider anyway, because exercising the genuine auth context is the point
 * of this suite: it is what catches contract drift between host and core.
 *
 * ETP-4576 — the session is a server-side `__Host-` cookie. The hook therefore
 * gates on `isAuthenticated`, never on a client-held `token`, and lets the real
 * `buildHeaders()` run so we can assert no Authorization header is produced.
 *
 * `restoreSession={null}` is REQUIRED on every AuthProvider below. Post-4576 the
 * prop defaults to the platform cookie fetcher, which fires a real
 * GET /sws/go/session on mount — through the very `globalThis.fetch` mock these
 * tests install. That extra call both pollutes the fetch-call assertions and
 * rewrites the session (dropping the seeded token), which is exactly why this
 * file failed 6/15 under LOCAL_CORE before this change. Passing an explicit
 * `null` opts out and makes `status` resolve synchronously. `undefined` does NOT
 * opt out — a default parameter only fills in for `undefined`.
 *
 * Run against local core source:
 *   LOCAL_CORE=1 SCHEMA_FORGE_CORE=<path-to-schema_forge_core> \
 *     npx vitest run src/hooks/__tests__/useDistinctValues.vitest.jsx
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { expectNoAuthorizationHeader } from '@/test/sessionContract.js';

import { AuthProvider } from '@/auth/AuthContext.jsx';
import { useDistinctValues } from '../useDistinctValues.js';

// Authenticated: a seeded token makes `isAuthenticated` true in both the
// pre-4576 core (`!!session.token`) and the migrated one, so this wrapper is
// stable across the published package and LOCAL_CORE source.
const wrapper = ({ children }) => (
  <AuthProvider initialSession={{ token: 'test-token' }} restoreSession={null}>
    {children}
  </AuthProvider>
);

// Unauthenticated: no token and no restore, so `status` settles to 'anonymous'
// and `isAuthenticated` is false in both core versions.
const anonWrapper = ({ children }) => (
  <AuthProvider initialSession={{}} restoreSession={null}>
    {children}
  </AuthProvider>
);

describe('useDistinctValues', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial empty state', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: { data: [], hasMore: false } }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('orderLine', 'product', { apiBaseUrl: '/api', enabled: false }),
      { wrapper },
    );
    expect(result.current.values).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('fetches values when enabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: { data: [{ id: 'P1', _identifier: 'Product 1' }], hasMore: false },
      }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('orderLine', 'product', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.values).toHaveLength(1);
    });
    expect(result.current.values[0].id).toBe('P1');
    expect(result.current.values[0]._identifier).toBe('Product 1');
  });

  it('normalizes scalar string entries to {id, _identifier}', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: { data: ['Active', 'Inactive'], hasMore: false },
      }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'status', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.values).toHaveLength(2);
    });
    expect(result.current.values[0]).toEqual({ id: 'Active', _identifier: 'Active' });
  });

  it('normalizes null entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: { data: [null], hasMore: false },
      }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.values).toHaveLength(1);
    });
    expect(result.current.values[0]).toEqual({ id: '', _identifier: '' });
  });

  it('handles hasMore=true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: { data: [{ id: 'P1', _identifier: 'P1' }], hasMore: true },
      }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });
  });

  it('handles fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.values).toEqual([]);
  });

  it('handles HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    });
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });

  it('does not fetch when enabled=false', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: { data: [] } }),
    });
    renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api', enabled: false }),
      { wrapper },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when entity is empty', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: { data: [] } }),
    });
    renderHook(() =>
      useDistinctValues('', 'field', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when field is empty', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: { data: [] } }),
    });
    renderHook(() =>
      useDistinctValues('entity', '', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when apiBaseUrl is empty', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: { data: [] } }),
    });
    renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '' }),
      { wrapper },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exposes search and setSearch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: { data: [], hasMore: false } }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    expect(result.current.search).toBe('');
    act(() => { result.current.setSearch('test'); });
    expect(result.current.search).toBe('test');
  });

  it('loadMore does nothing when hasMore is false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: { data: [], hasMore: false } }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const fetchCount = globalThis.fetch.mock.calls.length;
    act(() => { result.current.loadMore(); });
    // No additional fetch should happen
    expect(globalThis.fetch.mock.calls.length).toBe(fetchCount);
  });

  it('normalizes object entry without _identifier', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: { data: [{ id: 'X1' }], hasMore: false },
      }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.values).toHaveLength(1));
    expect(result.current.values[0]._identifier).toBe('X1');
  });

  it('does not fetch when the user is not authenticated', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: { data: [{ id: 'P1' }], hasMore: false } }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
      { wrapper: anonWrapper },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.values).toEqual([]);
  });

  it('never sends an Authorization header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: { data: [{ id: 'P1', _identifier: 'Product 1' }], hasMore: false },
      }),
    });
    const { result } = renderHook(() =>
      useDistinctValues('orderLine', 'product', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.values).toHaveLength(1));
    // Real buildHeaders() runs here — the assertion is that it produces no
    // bearer token now that the `__Host-` cookie authenticates the request.
    expectNoAuthorizationHeader();
  });

  it('refresh re-fetches from start', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: [{ id: `P${callCount}`, _identifier: `P${callCount}` }], hasMore: false } }),
      });
    });
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.values).toHaveLength(1));
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2));
  });
});
