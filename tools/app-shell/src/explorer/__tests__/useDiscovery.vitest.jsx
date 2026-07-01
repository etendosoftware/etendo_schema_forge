// Real Vitest import test for useDiscovery hooks — replaces source-reading test
import { renderHook, waitFor, act } from '@testing-library/react';

// Import the exported async functions and hooks
import {
  useSpecs,
  useSpecDetail,
  useNeoFetch,
  upsertSpec,
  upsertEntity,
  upsertField,
  fetchMenuTree,
  populateSpec,
} from '../useDiscovery.js';

describe('useDiscovery', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    // Set up localStorage for token
    globalThis.localStorage = {
      _store: {},
      getItem(key) { return this._store[key] ?? null; },
      setItem(key, val) { this._store[key] = val; },
      removeItem(key) { delete this._store[key]; },
    };
    localStorage.setItem('sf_auth_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useSpecs', () => {
    it('returns loading=true initially then loads specs', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ specs: ['sales-order', 'purchase-order'] }),
      });

      const { result } = renderHook(() => useSpecs());

      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.specs).toEqual(['sales-order', 'purchase-order']);
      expect(result.current.error).toBeNull();
    });

    it('handles fetch error', async () => {
      globalThis.fetch.mockRejectedValue(new Error('Network fail'));

      const { result } = renderHook(() => useSpecs());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('Network fail');
      expect(result.current.specs).toEqual([]);
    });

    it('handles HTTP error status', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useSpecs());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('500 Internal Server Error');
    });

    it('refresh function re-fetches data', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ specs: ['a'] }),
      });

      const { result } = renderHook(() => useSpecs());
      await waitFor(() => expect(result.current.loading).toBe(false));

      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ specs: ['a', 'b'] }),
      });

      act(() => result.current.refresh());

      await waitFor(() => expect(result.current.specs).toEqual(['a', 'b']));
    });

    it('defaults to empty array when specs key is missing', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useSpecs());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.specs).toEqual([]);
    });
  });

  describe('useSpecDetail', () => {
    it('does not fetch when specName is falsy', async () => {
      const { result } = renderHook(() => useSpecDetail(null));

      // Should not be loading, spec should be null
      expect(result.current.loading).toBe(false);
      expect(result.current.spec).toBeNull();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('fetches spec detail when specName is provided', async () => {
      const specData = { name: 'sales-order', entities: [] };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => specData,
      });

      const { result } = renderHook(() => useSpecDetail('sales-order'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.spec).toEqual(specData);
      expect(result.current.error).toBeNull();
    });

    it('handles error when fetching spec detail', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const { result } = renderHook(() => useSpecDetail('nonexistent'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('404 Not Found');
    });
  });

  describe('useNeoFetch', () => {
    it('returns a function that fetches from NEO base', async () => {
      const responseBody = { data: [{ id: '1' }] };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        json: async () => responseBody,
      });

      const { result } = renderHook(() => useNeoFetch());

      const fetchFn = result.current;
      expect(typeof fetchFn).toBe('function');

      const res = await fetchFn('/sales-order/header');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(responseBody);
      expect(typeof res.elapsed).toBe('number');
    });

    it('handles text responses (non-JSON)', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'text/plain' },
        text: async () => 'plain text response',
      });

      const { result } = renderHook(() => useNeoFetch());
      const res = await result.current('/some/path');
      expect(res.body).toBe('plain text response');
    });
  });

  describe('upsertSpec', () => {
    it('calls SFUpsertSpec webhook with params', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      const result = await upsertSpec({ Name: 'test-spec', ModuleID: 'mod-1' });
      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      const [url, opts] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('SFUpsertSpec');
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body.Name).toBe('test-spec');
      expect(body.ModuleID).toBe('mod-1');
    });

    it('includes optional fields when provided', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
      });

      await upsertSpec({
        Name: 'test', ModuleID: 'mod-1',
        SpecType: 'window', WindowID: 'win-1', Description: 'desc', SpecID: 'spec-1',
      });

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.SpecType).toBe('window');
      expect(body.WindowID).toBe('win-1');
      expect(body.Description).toBe('desc');
      expect(body.SpecID).toBe('spec-1');
    });

    it('throws on HTTP error', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: 'Server error' }),
      });

      await expect(upsertSpec({ Name: 'x', ModuleID: 'm' })).rejects.toThrow('Server error');
    });
  });

  describe('upsertEntity', () => {
    it('calls SFUpsertEntity webhook', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      });

      await upsertEntity({ SpecID: 's1', TabID: 't1', ModuleID: 'm1' });
      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('SFUpsertEntity');
    });

    it('converts SeqNo to string', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      });

      await upsertEntity({ SpecID: 's1', TabID: 't1', ModuleID: 'm1', SeqNo: 10 });
      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.SeqNo).toBe('10');
    });
  });

  describe('upsertField', () => {
    it('calls SFUpsertField webhook', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      });

      await upsertField({ EntityID: 'e1', ColumnID: 'c1', ModuleID: 'm1' });
      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('SFUpsertField');
    });
  });

  describe('fetchMenuTree', () => {
    it('calls SFListMenu and parses inner JSON result', async () => {
      const menuData = [{ id: '1', name: 'Sales' }];
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ result: JSON.stringify(menuData) }),
      });

      const result = await fetchMenuTree('Sales');
      expect(result).toEqual(menuData);
    });

    it('returns raw data when result is not a JSON string', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ result: { raw: true } }),
      });

      const result = await fetchMenuTree();
      expect(result).toEqual({ result: { raw: true } });
    });
  });

  describe('populateSpec', () => {
    it('calls SFPopulateSpec webhook', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ populated: true }),
      });

      const result = await populateSpec({ SpecID: 'spec-1' });
      expect(result).toEqual({ populated: true });

      const [url] = globalThis.fetch.mock.calls[0];
      expect(url).toContain('SFPopulateSpec');
    });
  });
});
