import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/auth/api.js', () => ({
  buildHeaders: (token) => ({ Authorization: `Bearer ${token}` }),
}));

import { useDistinctValues } from '../useDistinctValues.js';

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
    );
    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });
  });

  it('handles fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() =>
      useDistinctValues('entity', 'field', { apiBaseUrl: '/api' }),
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
    );
    await waitFor(() => expect(result.current.values).toHaveLength(1));
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2));
  });
});