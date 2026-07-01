/**
 * Tests for entityLookup helpers and hooks — escHql, deriveEntityEndpoint,
 * useClickOutside, and the debounced useEntitySearch (with fake timers + mocked fetch).
 */

import { renderHook, act } from '@testing-library/react';
import {
  SEARCH_DEBOUNCE_MS,
  escHql,
  deriveEntityEndpoint,
  useClickOutside,
  useEntitySearch,
} from '../entityLookup.js';

describe('escHql', () => {
  it('escapes single quotes by doubling them', () => {
    expect(escHql("O'Brien")).toBe("O''Brien");
  });

  it('returns the value unchanged when no quotes are present', () => {
    expect(escHql('plain')).toBe('plain');
  });

  it('coerces non-string values to string', () => {
    expect(escHql(42)).toBe('42');
    expect(escHql(null)).toBe('null');
  });
});

describe('deriveEntityEndpoint', () => {
  it('returns null when called with no argument', () => {
    expect(deriveEntityEndpoint()).toBeNull();
  });

  it('returns null for an empty entitySpec', () => {
    expect(deriveEntityEndpoint({ entitySpec: '' })).toBeNull();
  });

  it('returns null when the entity segment is missing', () => {
    expect(deriveEntityEndpoint({ entitySpec: 'foo' })).toBeNull();
  });

  it('builds a contacts endpoint from contactsBase', () => {
    expect(
      deriveEntityEndpoint({ entitySpec: 'contacts/business-partner', contactsBase: '/sws/contacts' }),
    ).toBe('/sws/contacts/business-partner');
  });

  it('returns null for contacts without a contactsBase', () => {
    expect(deriveEntityEndpoint({ entitySpec: 'contacts/business-partner' })).toBeNull();
  });

  it('falls back to /sws/neo when no apiBaseUrl is provided', () => {
    expect(deriveEntityEndpoint({ entitySpec: 'product/product' })).toBe('/sws/neo/product/product');
  });

  it('replaces the trailing spec segment of apiBaseUrl', () => {
    expect(
      deriveEntityEndpoint({
        entitySpec: 'product/product',
        apiBaseUrl: '/sws/neo/purchase-invoice',
      }),
    ).toBe('/sws/neo/product/product');
  });
});

describe('useClickOutside', () => {
  let el;
  let ref;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
    ref = { current: el };
  });

  afterEach(() => {
    el.remove();
  });

  function fireMousedown(target) {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }

  it('does not add a listener when disabled', () => {
    const onOutside = vi.fn();
    renderHook(() => useClickOutside(ref, false, onOutside));
    fireMousedown(document.body);
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('calls onOutside on a mousedown outside the ref element', () => {
    const onOutside = vi.fn();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    renderHook(() => useClickOutside(ref, true, onOutside));
    fireMousedown(outside);
    expect(onOutside).toHaveBeenCalledTimes(1);
    outside.remove();
  });

  it('does not call onOutside on a mousedown inside the ref element', () => {
    const onOutside = vi.fn();
    renderHook(() => useClickOutside(ref, true, onOutside));
    fireMousedown(el);
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const onOutside = vi.fn();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const { unmount } = renderHook(() => useClickOutside(ref, true, onOutside));
    unmount();
    fireMousedown(outside);
    expect(onOutside).not.toHaveBeenCalled();
    outside.remove();
  });
});

describe('useEntitySearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const baseParams = {
    open: true,
    endpoint: '/sws/neo/product/product',
    token: 'tok',
    query: '',
    filter: undefined,
    limit: 20,
  };

  it('does nothing when open/endpoint/token are falsy', () => {
    renderHook(() => useEntitySearch({ ...baseParams, open: false }));
    renderHook(() => useEntitySearch({ ...baseParams, endpoint: '' }));
    renderHook(() => useEntitySearch({ ...baseParams, token: '' }));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches after the debounce and sets items from json.response.data', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ id: '1' }] } }),
    });
    const { result } = renderHook(() => useEntitySearch(baseParams));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.items).toEqual([{ id: '1' }]);
    expect(result.current.loading).toBe(false);
  });

  it('falls back to json.data when response.data is absent', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: '2' }] }),
    });
    const { result } = renderHook(() => useEntitySearch(baseParams));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.items).toEqual([{ id: '2' }]);
  });

  it('falls back to [] when no data field exists', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useEntitySearch(baseParams));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.items).toEqual([]);
  });

  it('coerces non-array data to []', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { not: 'array' } } }),
    });
    const { result } = renderHook(() => useEntitySearch(baseParams));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.items).toEqual([]);
  });

  it('keeps items empty when the response is not ok', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useEntitySearch(baseParams));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('uses the base filter for an empty query', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    renderHook(() => useEntitySearch({ ...baseParams, query: '   ' }));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain(`_neoWhere=${encodeURIComponent('active = true')}`);
    expect(url).toContain('limit=20');
  });

  it('honors a custom filter prop for an empty query', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    renderHook(() => useEntitySearch({ ...baseParams, filter: 'isActive = true' }));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain(`_neoWhere=${encodeURIComponent('isActive = true')}`);
  });

  it('builds a lower(name) like clause and passes the Bearer token for a trimmed query', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    renderHook(() => useEntitySearch({ ...baseParams, query: "  O'Brien  " }));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    const [url, opts] = globalThis.fetch.mock.calls[0];
    const expectedWhere = "lower(name) like lower('%O''Brien%') and active = true";
    expect(url).toContain(`_neoWhere=${encodeURIComponent(expectedWhere)}`);
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });

  it('cancels an in-flight request when params change (does not set items after cancel)', async () => {
    let resolveFetch;
    globalThis.fetch
      .mockImplementationOnce(
        () => new Promise((r) => { resolveFetch = () => r({ ok: true, json: async () => ({ data: [{ id: 'stale' }] }) }); }),
      )
      .mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'fresh' }] }) });

    const { result, rerender } = renderHook((p) => useEntitySearch(p), {
      initialProps: { ...baseParams, query: 'a' },
    });

    // Start the first debounced request.
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    // Change params -> cleanup runs and cancels the first request.
    rerender({ ...baseParams, query: 'b' });

    // Resolve the now-cancelled first fetch; its result must be ignored.
    await act(async () => {
      resolveFetch();
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.items).toEqual([{ id: 'fresh' }]);
  });

  it('sets items to [] when fetch rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useEntitySearch(baseParams));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
