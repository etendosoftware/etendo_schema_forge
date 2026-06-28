// No external mocks needed — we mock global fetch directly.

import { renderHook, waitFor } from '@testing-library/react';
import { useWarehouseStock } from '../useWarehouseStock';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(data) {
  return Promise.resolve({
    ok: true,
    statusText: 'OK',
    json: () => Promise.resolve({ response: { data } }),
  });
}

function makeFetchFail(status = 500, text = 'Internal Server Error') {
  return Promise.resolve({
    ok: false,
    status,
    statusText: text,
    json: () => Promise.resolve({}),
  });
}

const BINS = [{ id: 'bin-1' }, { id: 'bin-2' }];

const BIN_CONTENTS = [
  { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 10, etgoValuation: 100 },
  { product: 'p2', 'product$_identifier': 'Gadget', uOM: 'u2', quantityOnHand: 3, etgoValuation: 30 },
];

const TRANSACTIONS = [
  { id: 'tx-1', movementDate: '2025-01-01', movementQuantity: 10 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWarehouseStock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts with loading:true and empty collections', () => {
      globalThis.fetch = vi.fn(() => new Promise(() => {})); // never resolves
      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'token', '/api'),
      );
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.products).toEqual([]);
      expect(result.current.transactions).toEqual([]);
    });
  });

  describe('no warehouseId', () => {
    it('stays in initial loading state when warehouseId is falsy', () => {
      globalThis.fetch = vi.fn();
      const { result } = renderHook(() =>
        useWarehouseStock(null, 'token', '/api'),
      );
      // useEffect returns early — no fetch
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
    });
  });

  describe('empty bins short-circuit', () => {
    it('resolves with empty products and transactions when no bins exist', async () => {
      globalThis.fetch = vi.fn()
        .mockImplementationOnce(() => makeFetchOk([])) // storageBin → empty
        .mockImplementationOnce(() => makeFetchOk([])); // uOM selector

      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'token', '/api'),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBeNull();
      expect(result.current.products).toEqual([]);
      expect(result.current.transactions).toEqual([]);
    });
  });

  describe('successful load with bins and contents', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('storageBin?')) return makeFetchOk(BINS);
        if (url.includes('selectors/uOM')) return makeFetchOk([]);
        if (url.includes('binContents?')) return makeFetchOk(BIN_CONTENTS);
        if (url.includes('productTransactions?')) return makeFetchOk(TRANSACTIONS);
        return makeFetchOk([]);
      });
    });

    it('transitions from loading:true to loading:false', async () => {
      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'token', '/api'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('sets error to null on success', async () => {
      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'token', '/api'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBeNull();
    });

    it('returns aggregated products (deduped across bins)', async () => {
      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'token', '/api'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      // BIN_CONTENTS has p1 + p2, fetched for each of 2 bins → 4 total rows → aggregated to 2 products
      expect(result.current.products.length).toBeGreaterThan(0);
      const ids = result.current.products.map(p => p.id);
      expect(ids).toContain('p1');
      expect(ids).toContain('p2');
    });

    it('returns transactions flat-merged from all bins', async () => {
      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'token', '/api'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      // TRANSACTIONS fetched for 2 bins → 2 tx entries
      expect(result.current.transactions.length).toBe(BINS.length * TRANSACTIONS.length);
    });

    it('passes Authorization header to fetch', async () => {
      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'my-token', '/api'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('storageBin'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
        }),
      );
    });
  });

  describe('UoM resolution via selector', () => {
    it('passes uomMap built from selector to aggregateProducts', async () => {
      const uomSelectorData = [{ id: 'u1', identifier: 'Each' }];
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('storageBin?')) return makeFetchOk([{ id: 'bin-1' }]);
        if (url.includes('selectors/uOM')) return makeFetchOk(uomSelectorData);
        if (url.includes('binContents?'))
          return makeFetchOk([{ product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 5, etgoValuation: 50 }]);
        if (url.includes('productTransactions?')) return makeFetchOk([]);
        return makeFetchOk([]);
      });

      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'token', '/api'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      const product = result.current.products.find(p => p.id === 'p1');
      expect(product).toBeDefined();
      expect(product.uom).toBe('Each');
    });
  });

  describe('error path', () => {
    it('sets error message when storageBin fetch fails', async () => {
      globalThis.fetch = vi.fn()
        .mockImplementationOnce(() => makeFetchFail(500, 'Server Error'))
        .mockImplementationOnce(() => makeFetchOk([])); // uOM selector (parallel)

      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'token', '/api'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBeTruthy();
      expect(result.current.products).toEqual([]);
      expect(result.current.transactions).toEqual([]);
    });

    it('sets error when binContents fetch throws a network error', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('storageBin?')) return makeFetchOk([{ id: 'bin-1' }]);
        if (url.includes('selectors/uOM')) return makeFetchOk([]);
        if (url.includes('binContents?')) return Promise.reject(new Error('Network failure'));
        return makeFetchOk([]);
      });

      const { result } = renderHook(() =>
        useWarehouseStock('wh-1', 'token', '/api'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('Network failure');
    });
  });

  describe('refreshKey', () => {
    it('re-fetches when refreshKey changes', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('storageBin?')) return makeFetchOk([]);
        return makeFetchOk([]);
      });

      const { rerender } = renderHook(
        ({ rk }) => useWarehouseStock('wh-1', 'token', '/api', rk),
        { initialProps: { rk: 0 } },
      );
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      const callsAfterFirst = globalThis.fetch.mock.calls.length;

      rerender({ rk: 1 });
      await waitFor(() =>
        expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(callsAfterFirst),
      );
    });
  });
});
