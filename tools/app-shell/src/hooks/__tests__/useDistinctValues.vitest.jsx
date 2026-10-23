// @covers tools/app-shell/src/hooks/useDistinctValues.js
/**
 * Functional boundary test for useDistinctValues.
 *
 * The hook at `@/hooks/useDistinctValues.js` is a full local copy (it is NOT a shim of
 * the core package): the functional copy is the one used at runtime by ListFilterBar, and
 * core keeps its own copy for its own consumers (AdvancedFilterBuilder, distinct-values-filter).
 *
 * This suite is deliberately re-angled to verify the FUNCTIONAL boundary: the
 * shim resolves to the real hook AND `useAuth()` is satisfied by a REAL
 * AuthProvider. The old `vi.mock('@/auth/...')` stubs are gone — they never
 * crossed the shim (the hook imports auth via core's own relative path, which the
 * `@/auth` alias does not intercept), which is exactly what caused the
 * "useAuth must be used within AuthProvider" failures. We wrap renderHook in the
 * real core AuthProvider (via the `@/auth` shim → same core context the hook
 * uses) seeded with a token, and let the REAL `buildHeaders` run.
 *
 * Run against local core source:
 *   LOCAL_CORE=1 npx vitest run src/hooks/__tests__/useDistinctValues.vitest.jsx
 */
import { renderHook, act, waitFor } from '@testing-library/react';

import { AuthProvider } from '@/auth/AuthContext.jsx';
import { useDistinctValues } from '../useDistinctValues.js';

// Real AuthProvider seeded with a token so the hook's useAuth() resolves — both
// the hook and this provider reach the same core auth context through the shim.
const wrapper = ({ children }) => (
  <AuthProvider initialSession={{ token: 'test-token' }}>{children}</AuthProvider>
);

// ETP-5195: AuthProvider fires a silent `GET /sws/neo/refreshtoken` on mount whenever it has a
// token — legitimate and unrelated to the entity-specific fetch these hooks make. Filter it out
// before asserting "no fetch happened", rather than asserting fetch was never called at all.
function isAuthRefreshCall([url]) {
  return typeof url === 'string' && url.endsWith('/refreshtoken');
}

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
    expect(fetchSpy.mock.calls.filter((call) => !isAuthRefreshCall(call))).toHaveLength(0);
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
    expect(fetchSpy.mock.calls.filter((call) => !isAuthRefreshCall(call))).toHaveLength(0);
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
    expect(fetchSpy.mock.calls.filter((call) => !isAuthRefreshCall(call))).toHaveLength(0);
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
    expect(fetchSpy.mock.calls.filter((call) => !isAuthRefreshCall(call))).toHaveLength(0);
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
  describe('extraParams', () => {
    function mockEmpty() {
      return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: { data: [], hasMore: false } }),
      });
    }
    const distinctCalls = (spy) =>
      spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('_distinct='));
    const paramsOf = (url) => new URLSearchParams(url.split('?')[1] ?? '');

    it('sends extraParams together with the distinct and paging params', async () => {
      const spy = mockEmpty();
      renderHook(() =>
        useDistinctValues('entity', 'status', {
          apiBaseUrl: '/api',
          extraParams: 'criteria=%5B%7B%22a%22%3A1%7D%5D&active=true',
        }),
        { wrapper },
      );
      await waitFor(() => expect(distinctCalls(spy).length).toBeGreaterThanOrEqual(1));
      const params = paramsOf(distinctCalls(spy)[0]);
      expect(params.get('criteria')).toBe('[{"a":1}]');
      expect(params.get('active')).toBe('true');
      expect(params.get('_distinct')).toBe('status');
      expect(params.get('_startRow')).toBe('0');
      expect(params.has('_endRow')).toBe(true);
    });

    it('does not let extraParams override the hook own reserved params', async () => {
      const spy = mockEmpty();
      renderHook(() =>
        useDistinctValues('entity', 'status', {
          apiBaseUrl: '/api',
          extraParams: '_distinct=other&_startRow=99&_endRow=999&_distinctSearch=zzz&active=true',
        }),
        { wrapper },
      );
      await waitFor(() => expect(distinctCalls(spy).length).toBeGreaterThanOrEqual(1));
      const params = paramsOf(distinctCalls(spy)[0]);
      expect(params.getAll('_distinct')).toEqual(['status']);
      expect(params.getAll('_startRow')).toEqual(['0']);
      expect(params.get('_endRow')).not.toBe('999');
      expect(params.getAll('_endRow')).toHaveLength(1);
      expect(params.has('_distinctSearch')).toBe(false);
      expect(params.get('active')).toBe('true');
    });

    it('refetches page 1 when extraParams changes while enabled', async () => {
      const spy = mockEmpty();
      const { rerender } = renderHook(
        ({ extra }) => useDistinctValues('entity', 'status', { apiBaseUrl: '/api', extraParams: extra }),
        { wrapper, initialProps: { extra: 'active=true' } },
      );
      // The auth provider may re-issue the first request once; only the query string matters.
      await waitFor(() => expect(distinctCalls(spy).length).toBeGreaterThanOrEqual(1));
      expect(distinctCalls(spy).every((u) => paramsOf(u).get('active') === 'true')).toBe(true);
      rerender({ extra: 'active=false' });
      await waitFor(() => {
        const calls = distinctCalls(spy);
        expect(paramsOf(calls[calls.length - 1]).get('active')).toBe('false');
      });
      const calls = distinctCalls(spy);
      expect(paramsOf(calls[calls.length - 1]).get('_startRow')).toBe('0');
    });

    it('yields exactly the plain distinct URL when extraParams is empty or omitted', async () => {
      const spy = mockEmpty();
      renderHook(() => useDistinctValues('entity', 'status', { apiBaseUrl: '/api', extraParams: '' }), { wrapper });
      renderHook(() => useDistinctValues('entity', 'status', { apiBaseUrl: '/api' }), { wrapper });
      await waitFor(() => expect(distinctCalls(spy).length).toBeGreaterThanOrEqual(2));
      const [a, b] = distinctCalls(spy);
      expect(a).toBe(b);
      expect([...paramsOf(a).keys()].sort()).toEqual(['_distinct', '_endRow', '_startRow']);
    });
  });
});
