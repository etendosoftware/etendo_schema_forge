/**
 * Functional boundary test for useDistinctValues.
 *
 * Post-split, the hook itself lives in schema_forge_core; this repo only ships a
 * thin shim at `@/hooks/useDistinctValues.js` (re-export of
 * `@etendosoftware/app-shell-core/hooks/useDistinctValues.js`). Under plain
 * vitest the shim resolves to the published package; under LOCAL_CORE it resolves
 * to the moved core source. The exhaustive unit coverage now lives beside the
 * source in core (packages/app-shell-core/src/hooks/__tests__).
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
  <AuthProvider initialSession={{ token: 'test-token' }} restoreSession={null}>{children}</AuthProvider>
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
