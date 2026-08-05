import { renderHook, waitFor } from '@testing-library/react';
import { setAuthMock, configureAuthMock } from '@/test/authContextMock.js';
import { expectNoAuthorizationHeader } from '@/test/sessionContract.js';
import { useQuickPurchaseData, SEND_METHODS } from '../useQuickPurchaseData';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

configureAuthMock({ isAuthenticated: true });

describe('useQuickPurchaseData', () => {
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
              { id: 'p1', label: 'Laptop Dell', price: 800, searchKey: 'DELL1' },
              { id: 'p2', label: 'Mouse Logitech', price: 25, searchKey: 'MOU1' },
            ],
          }),
        };
      }
      if (url.includes('/selectors/C_BPartner_ID')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { id: 'sup1', label: 'Supplier Corp', taxID: 'S123', email: 's@test.com' },
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
    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

    expect(result.current.loading).toBe(true);
    expect(result.current.products).toEqual([]);
    expect(result.current.suppliers).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('loads products and suppliers from API', async () => {
    mockCatalogResponses();
    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.products).toHaveLength(2);
    expect(result.current.products[0].name).toBe('Laptop Dell');
    expect(result.current.products[0].price).toBe(800);

    // No anonymous supplier (unlike sales)
    expect(result.current.suppliers).toHaveLength(1);
    expect(result.current.suppliers[0].name).toBe('Supplier Corp');
  });

  it('derives product categories via guessCategory', async () => {
    mockCatalogResponses();
    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const laptop = result.current.products.find(p => p.name === 'Laptop Dell');
    expect(laptop.category).toBe('Computing');
    const mouse = result.current.products.find(p => p.name === 'Mouse Logitech');
    expect(mouse.category).toBe('Peripherals');
  });

  it('computes categories as unique set', async () => {
    mockCatalogResponses();
    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.categories).toBeDefined();
    expect(Array.isArray(result.current.categories)).toBe(true);
    // Each category appears once
    const uniqueCheck = new Set(result.current.categories);
    expect(uniqueCheck.size).toBe(result.current.categories.length);
  });

  it('sets error when apiBaseUrl is null', async () => {
    const { result } = renderHook(() => useQuickPurchaseData(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('sets error when fetch fails', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network failure'));
    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain('Failed to load purchase data');
  });

  it('deduplicates products by id_price key', async () => {
    globalThis.fetch.mockImplementation(async (url) => {
      if (url.includes('/selectors/M_Product_ID')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { id: 'p1', label: 'Cable USB', price: 5 },
              { id: 'p1', label: 'Cable USB', price: 5 }, // duplicate
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

    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.products).toHaveLength(1);
  });

  it('computes topSellers from previous orders', async () => {
    globalThis.fetch.mockImplementation(async (url) => {
      if (url.includes('/selectors/M_Product_ID')) {
        return { ok: true, json: async () => ({ items: [{ id: 'p1', label: 'Item', price: 10 }] }) };
      }
      if (url.includes('/selectors/C_BPartner_ID')) {
        return { ok: true, json: async () => ({ items: [{ id: 'sup1', label: 'Sup A' }] }) };
      }
      if (url.includes('/selectors/C_Tax_ID')) {
        return { ok: true, json: async () => ({ items: [{ id: 't1', name: 'Tax', rate: 21 }] }) };
      }
      if (url.includes('/selectors/C_UOM_ID')) {
        return { ok: true, json: async () => ({ items: [] }) };
      }
      if (url.includes('/header?')) {
        return {
          ok: true,
          json: async () => ({
            response: {
              data: [
                { id: 'o1', documentStatus: 'CO', businessPartner: 'sup1', 'businessPartner$_identifier': 'Sup A', grandTotalAmount: 100 },
              ],
            },
          }),
        };
      }
      // Lines for order o1
      if (url.includes('/lines?parentId=o1')) {
        return {
          ok: true,
          json: async () => ({
            response: {
              data: [
                { product: 'p1', 'product$_identifier': 'Item', orderedQuantity: 5, priceActual: 10 },
              ],
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.previousOrders).toHaveLength(1);
    expect(result.current.topSellers).toHaveProperty('sup1');
    expect(result.current.topSellers.sup1).toContain('p1');
  });

  it('sets error and issues no request when unauthenticated', async () => {
    mockCatalogResponses();
    setAuthMock({ isAuthenticated: false });

    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

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

    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.products).toHaveLength(2);
  });

  it('never sends an Authorization header on any catalog request', async () => {
    mockCatalogResponses();

    const { result } = renderHook(() => useQuickPurchaseData('http://localhost/api'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(globalThis.fetch).toHaveBeenCalled();
    // ETP-4576 — the `__Host-` session cookie authenticates every call.
    expectNoAuthorizationHeader();
  });

  it('exports SEND_METHODS constant', () => {
    expect(SEND_METHODS).toHaveLength(3);
    expect(SEND_METHODS[0].id).toBe('email');
    expect(SEND_METHODS[1].id).toBe('whatsapp');
    expect(SEND_METHODS[2].id).toBe('pdf');
  });
});
