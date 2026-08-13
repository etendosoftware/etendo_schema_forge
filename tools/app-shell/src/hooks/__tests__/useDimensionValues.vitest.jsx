/**
 * Tests for useDimensionValues: guard early-returns (disabled / no token /
 * empty dims), successful multi-dimension fetch, non-ok and reject fallbacks,
 * non-array coercion, and abort on cleanup. Auth + getApiBase are mocked.
 */

let mockToken = 'tok';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: mockToken }),
}));

vi.mock('../useNeoResource', () => ({
  getApiBase: () => '/base',
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useDimensionValues } from '../useDimensionValues.js';

beforeEach(() => {
  mockToken = 'tok';
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDimensionValues', () => {
  it('returns empty options and skips fetch when disabled', async () => {
    const { result } = renderHook(() => useDimensionValues(['organization'], false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.optionsByDim).toEqual({});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('skips fetch when token is missing', async () => {
    mockToken = '';
    const { result } = renderHook(() => useDimensionValues(['organization']));
    await waitFor(() => expect(result.current.optionsByDim).toEqual({}));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('skips fetch when the dimension list is empty', async () => {
    const { result } = renderHook(() => useDimensionValues([]));
    await waitFor(() => expect(result.current.optionsByDim).toEqual({}));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('treats undefined dimensions as empty', async () => {
    const { result } = renderHook(() => useDimensionValues(undefined));
    await waitFor(() => expect(result.current.optionsByDim).toEqual({}));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches values for each dimension and builds the map', async () => {
    globalThis.fetch.mockImplementation((url) => {
      const values = url.includes('dimension=organization')
        ? [{ id: 'o1', name: 'Org 1' }]
        : [{ id: 'p1', name: 'Proj 1' }];
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: { values } } }) });
    });

    const { result } = renderHook(() => useDimensionValues(['organization', 'project']));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.optionsByDim).toEqual({
      organization: [{ id: 'o1', name: 'Org 1' }],
      project: [{ id: 'p1', name: 'Proj 1' }],
    });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('/base/sws/neo/financial-account-transactions');
    expect(url).toContain('action=dimension-values');
    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('returns [] for a dimension when the response is not ok', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useDimensionValues(['organization']));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.optionsByDim).toEqual({ organization: [] });
  });

  it('coerces a non-array values payload to []', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { values: 'nope' } } }),
    });
    const { result } = renderHook(() => useDimensionValues(['organization']));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.optionsByDim).toEqual({ organization: [] });
  });

  it('returns [] when the fetch rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useDimensionValues(['organization']));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.optionsByDim).toEqual({ organization: [] });
  });

  it('re-runs when the dimension set changes', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { values: [] } } }),
    });
    const { result, rerender } = renderHook(
      ({ dims }) => useDimensionValues(dims),
      { initialProps: { dims: ['a'] } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = globalThis.fetch.mock.calls.length;

    rerender({ dims: ['a', 'b'] });
    await waitFor(() => expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(before));
  });

  it('aborts the request on unmount', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { values: [] } } }),
    });
    const { unmount } = renderHook(() => useDimensionValues(['organization']));
    unmount();
    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });
});
