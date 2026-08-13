// --- Mocks (before imports) ---

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ username: 'testuser', token: 'test-token' }),
}));

vi.mock('@/auth/api.js', () => ({
  buildHeaders: (token) => ({ Authorization: `Bearer ${token}` }),
  detectBaseUrl: () => 'http://localhost',
}));

// --- Imports ---

import { renderHook, act, waitFor } from '@testing-library/react';
import { FavoritesProvider, useFavorites } from '../FavoritesContext.jsx';

// --- Helpers ---

function wrapper({ children }) {
  return <FavoritesProvider>{children}</FavoritesProvider>;
}

// --- Tests ---

describe('FavoritesContext', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useFavorites without provider', () => {
    it('returns safe defaults when used outside provider', () => {
      const { result } = renderHook(() => useFavorites());
      expect(result.current.favorites).toEqual([]);
      expect(result.current.isFavorite('anything')).toBe(false);
    });

    it('provides noop functions when outside provider', () => {
      const { result } = renderHook(() => useFavorites());
      // Should not throw
      result.current.addFavorite('test', 'Test');
      result.current.removeFavorite('test');
      result.current.toggleFavorite('test', 'Test');
    });
  });

  describe('useFavorites with provider', () => {
    it('returns empty favorites initially', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      expect(result.current.favorites).toEqual([]);
    });

    it('adds a favorite', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      act(() => {
        result.current.addFavorite('sales-order', 'Sales Order');
      });
      expect(result.current.favorites).toHaveLength(1);
      expect(result.current.favorites[0].name).toBe('sales-order');
      expect(result.current.favorites[0].label).toBe('Sales Order');
    });

    it('does not add duplicate favorites', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      act(() => {
        result.current.addFavorite('sales-order', 'Sales Order');
      });
      act(() => {
        result.current.addFavorite('sales-order', 'Sales Order');
      });
      expect(result.current.favorites).toHaveLength(1);
    });

    it('removes a favorite', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      act(() => {
        result.current.addFavorite('sales-order', 'Sales Order');
      });
      act(() => {
        result.current.removeFavorite('sales-order');
      });
      expect(result.current.favorites).toHaveLength(0);
    });

    it('toggles a favorite on and off', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      act(() => {
        result.current.toggleFavorite('product', 'Product');
      });
      expect(result.current.isFavorite('product')).toBe(true);

      act(() => {
        result.current.toggleFavorite('product', 'Product');
      });
      expect(result.current.isFavorite('product')).toBe(false);
    });

    it('reports isFavorite correctly', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      expect(result.current.isFavorite('sales-order')).toBe(false);
      act(() => {
        result.current.addFavorite('sales-order', 'Sales Order');
      });
      expect(result.current.isFavorite('sales-order')).toBe(true);
    });

    it('ignores addFavorite with empty name', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      act(() => {
        result.current.addFavorite('', 'Empty');
      });
      expect(result.current.favorites).toHaveLength(0);
    });

    it('ignores toggleFavorite with empty name', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      act(() => {
        result.current.toggleFavorite('', 'Empty');
      });
      expect(result.current.favorites).toHaveLength(0);
    });

    it('persists favorites to localStorage', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      act(() => {
        result.current.addFavorite('product', 'Product');
      });
      const stored = JSON.parse(localStorage.getItem('sf_favorites_testuser'));
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('product');
    });

    it('syncs favorites to server on add', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      act(() => {
        result.current.addFavorite('product', 'Product');
      });
      // fetch is called once on mount (GET) and once on add (PUT)
      const putCalls = globalThis.fetch.mock.calls.filter(
        c => c[1]?.method === 'PUT'
      );
      expect(putCalls.length).toBe(1);
    });

    it('handles labels parameter in addFavorite', () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });
      const labels = { en_US: 'Product', es_ES: 'Producto' };
      act(() => {
        result.current.addFavorite('product', 'Product', labels);
      });
      expect(result.current.favorites[0].labels).toEqual(labels);
    });

    it('fetches favorites from server on mount', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: 'remote-fav', label: 'Remote Fav' }],
      });
      const { result } = renderHook(() => useFavorites(), { wrapper });
      await waitFor(() => {
        expect(result.current.favorites).toHaveLength(1);
      });
      expect(result.current.favorites[0].name).toBe('remote-fav');
    });

    it('handles server fetch error gracefully', async () => {
      globalThis.fetch.mockRejectedValueOnce(new Error('Network error'));
      const { result } = renderHook(() => useFavorites(), { wrapper });
      // Should not crash, falls back to localStorage
      await waitFor(() => {
        expect(result.current.favorites).toBeDefined();
      });
    });
  });
});
