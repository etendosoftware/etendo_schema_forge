/**
 * Tests for useWindowFilterPresets: refresh (load), savePreset (PUT),
 * deletePreset (DELETE), guard early-returns, and error handling.
 * Auth + the shared apiFetch helper are mocked.
 */

let mockToken = 'tok';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: mockToken }),
}));

const mockApiFetch = (path, options) => globalThis.fetch(`https://base${path}`, {
  headers: { Authorization: `Bearer ${mockToken}`, 'Accept-Language': 'es_ES' },
  credentials: 'include',
  ...options,
});

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useWindowFilterPresets } from '../useWindowFilterPresets.js';

beforeEach(() => {
  mockToken = 'tok';
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useWindowFilterPresets', () => {
  it('loads presets on mount and exposes them', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ A: { x: 1 } }) });
    const { result } = renderHook(() => useWindowFilterPresets('sales-order'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toEqual({ A: { x: 1 } });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toBe('https://base/sws/neo/filters/sales-order');
  });

  it('does not fetch when windowName is missing', async () => {
    const { result } = renderHook(() => useWindowFilterPresets(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // ETP-4576 — inverted: under the cookie scheme the client holds no token, so the presets
  // must still be requested. Gating on one made the whole feature silently disappear.
  it('still fetches when no token is held', async () => {
    mockToken = '';
    // The request actually goes out now, so the mock has to answer like the others do —
    // before, the token guard short-circuited and nothing ever awaited this.
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('falls back to {} when the response is not ok', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => ({ ignored: true }) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toEqual({});
  });

  it('coerces a non-object body to {}', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => null });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toEqual({});
  });

  it('sets presets to {} when the fetch rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toEqual({});
  });

  it('savePreset issues a PUT and updates local state', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.savePreset('mine', { columnFilters: [1] });
    });

    const putCall = globalThis.fetch.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall[0]).toBe('https://base/sws/neo/filters/w/mine');
    expect(JSON.parse(putCall[1].body)).toEqual({ columnFilters: [1] });
    expect(result.current.presets).toEqual({ mine: { columnFilters: [1] } });
  });

  it('savePreset defaults payload to {} when not provided', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.savePreset('mine');
    });

    expect(result.current.presets).toEqual({ mine: {} });
  });

  it('savePreset is a no-op when presetName is falsy', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    globalThis.fetch.mockClear();

    await act(async () => {
      await result.current.savePreset('');
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('deletePreset issues a DELETE and removes the entry', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ keep: {}, drop: {} }) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deletePreset('drop');
    });

    const delCall = globalThis.fetch.mock.calls.find((c) => c[1]?.method === 'DELETE');
    expect(delCall[0]).toBe('https://base/sws/neo/filters/w/drop');
    expect(result.current.presets).toEqual({ keep: {} });
  });

  it('deletePreset is a no-op when presetName is falsy', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    globalThis.fetch.mockClear();

    await act(async () => {
      await result.current.deletePreset('');
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refresh re-fetches on demand', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = globalThis.fetch.mock.calls.length;

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(before));
  });
});
