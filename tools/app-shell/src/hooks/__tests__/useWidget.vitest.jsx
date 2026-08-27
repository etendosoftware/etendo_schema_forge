import { renderHook, waitFor, act } from '@testing-library/react';
import { useWidget } from '../useWidget';

describe('useWidget', () => {
  const opts = { token: 'test-token', apiBaseUrl: 'http://localhost/api' };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns loading=true initially', () => {
    // Never-resolving fetch to keep loading state
    globalThis.fetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useWidget('my-widget', opts));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('fetches from the correct URL pattern', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });

    renderHook(() => useWidget('sales-kpis', opts));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost/api/sales-kpis/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token', 'Accept-Language': 'es_ES',
          }),
        }),
      );
    });
  });

  it('returns data on successful fetch', async () => {
    const mockData = [{ id: 1, value: 100 }];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: mockData } }),
    });

    const { result } = renderHook(() => useWidget('my-widget', opts));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('returns null data when response.data is missing', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: {} }),
    });

    const { result } = renderHook(() => useWidget('my-widget', opts));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
  });

  it('returns error on fetch failure (non-ok response)', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useWidget('my-widget', opts));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('500');
    expect(result.current.data).toBeNull();
  });

  it('returns error on network failure', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useWidget('my-widget', opts));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
  });

  it('refresh() triggers a re-fetch', async () => {
    let callCount = 0;
    globalThis.fetch.mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({ response: { data: { call: callCount } } }),
      };
    });

    const { result } = renderHook(() => useWidget('my-widget', opts));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ call: 1 });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ call: 2 });
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not fetch when token is missing', () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });

    renderHook(() => useWidget('my-widget', { token: '', apiBaseUrl: 'http://localhost' }));

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
