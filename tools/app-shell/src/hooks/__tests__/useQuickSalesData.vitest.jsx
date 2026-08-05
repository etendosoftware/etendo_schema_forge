import { renderHook, waitFor } from '@testing-library/react';
import { setAuthMock, configureAuthMock } from '@/test/authContextMock.js';
import { expectNoAuthorizationHeader } from '@/test/sessionContract.js';
import { useQuickSalesData, PAYMENT_METHODS } from '../useQuickSalesData';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

configureAuthMock({ isAuthenticated: true });

describe('useQuickSalesData', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockCatalogResponses() {
    globalThis.fetch.mockImplementation(async (url) => {
      if (url.includes('/selectors/M_Product_ID')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { id: 'p1', label: 'Cerveza IPA', price: 5.0, searchKey: 'BEER1' },
              { id: 'p2', label: 'Laptop Pro', price: 999.0, searchKey: 'LAP1' },
            ],
          }),
        };
      }
      if (url.includes('/selectors/C_BPartner_ID')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { id: 'bp1', label: 'John Doe', taxID: 'X123', email: 'j@test.com' },
            ],
          }),
        };
      }
      if (url.includes('/selectors/C_Tax_ID')) {
        return {
          ok: true,
          json: async () => ({
            items: [{ id: 't1', name: 'IVA 21%', rate: 21 }],
          }),
        };
      }
      if (url.includes('/selectors/C_UOM_ID')) {
        return {
          ok: true,
          json: async () => ({
            items: [{ id: 'u1', name: 'Unit' }],
          }),
        };
      }
      // Previous orders header
      if (url.includes('/header?')) {
        return {
          ok: true,
          json: async () => ({ response: { data: [] } }),
        };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });
  }

  it('starts with loading=true and empty arrays', () => {
    globalThis.fetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useQuickSalesData('http://localhost/api'));

    expect(result.current.loading).toBe(true);
    expect(result.current.products).toEqual([]);
    expect(result.current.customers).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('loads products and customers from API', async () => {
    mockCatalogResponses();
    const { result } = renderHook(() => useQuickSalesData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.products).toHaveLength(2);
    expect(result.current.products[0].name).toBe('Cerveza IPA');
    expect(result.current.products[0].price).toBe(5.0);

    // Customers include anonymous + fetched
    expect(result.current.customers.length).toBeGreaterThanOrEqual(2);
    expect(result.current.customers[0].isAnonymous).toBe(true);
    expect(result.current.customers[1].name).toBe('John Doe');
  });

  it('derives product categories via guessCategory', async () => {
    mockCatalogResponses();
    const { result } = renderHook(() => useQuickSalesData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.categories).toBeDefined();
    expect(result.current.categories.length).toBeGreaterThan(0);
    // 'Cerveza IPA' should be guessed as Beverages
    const beerProduct = result.current.products.find(p => p.name === 'Cerveza IPA');
    expect(beerProduct.category).toBe('Beverages');
  });

  it('sets error when apiBaseUrl is null (no connection)', async () => {
    const { result } = renderHook(() => useQuickSalesData(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('sets error when fetch fails', async () => {
    // All 4 selector fetches run in Promise.all, so rejecting any causes loadFromAPI to throw
    globalThis.fetch.mockRejectedValue(new Error('Network failure'));
    const { result } = renderHook(() => useQuickSalesData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error).toContain('Failed to load sales data');
  });

  it('deduplicates products by id_price key', async () => {
    globalThis.fetch.mockImplementation(async (url) => {
      if (url.includes('/selectors/M_Product_ID')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { id: 'p1', label: 'Widget', price: 10 },
              { id: 'p1', label: 'Widget', price: 10 }, // duplicate
              { id: 'p1', label: 'Widget', price: 20 }, // same product, different price
            ],
          }),
        };
      }
      if (url.includes('/selectors/C_BPartner_ID')) {
        return { ok: true, json: async () => ({ items: [] }) };
      }
      if (url.includes('/selectors/C_Tax_ID')) {
        return { ok: true, json: async () => ({ items: [{ id: 't1', name: 'IVA 21%', rate: 21 }] }) };
      }
      if (url.includes('/selectors/C_UOM_ID')) {
        return { ok: true, json: async () => ({ items: [] }) };
      }
      if (url.includes('/header?')) {
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderHook(() => useQuickSalesData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // p1_10 and p1_20 but not the duplicate p1_10
    expect(result.current.products).toHaveLength(2);
  });

  it('sets error and issues no request when unauthenticated', async () => {
    mockCatalogResponses();
    setAuthMock({ isAuthenticated: false });

    const { result } = renderHook(() => useQuickSalesData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
    expect(result.current.products).toEqual([]);
  });

  it('loads the catalog when authenticated even though the client holds no token', async () => {
    // The cookie-session shape: authenticated, no client-held token.
    setAuthMock({ isAuthenticated: true, token: null });
    mockCatalogResponses();

    const { result } = renderHook(() => useQuickSalesData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.products).toHaveLength(2);
  });

  it('never sends an Authorization header on any catalog request', async () => {
    mockCatalogResponses();

    const { result } = renderHook(() => useQuickSalesData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(globalThis.fetch).toHaveBeenCalled();
    // ETP-4576 — the `__Host-` session cookie authenticates every call.
    expectNoAuthorizationHeader();
  });

  it('exports PAYMENT_METHODS constant', () => {
    expect(PAYMENT_METHODS).toHaveLength(3);
    expect(PAYMENT_METHODS[0].id).toBe('cash');
    expect(PAYMENT_METHODS[1].id).toBe('card');
    expect(PAYMENT_METHODS[2].id).toBe('transfer');
  });
});
