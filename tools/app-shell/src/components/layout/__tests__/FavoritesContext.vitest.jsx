// --- Mocks (before imports) ---

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

configureAuthMock({ username: 'testuser', isAuthenticated: true, csrfToken: 'csrf-abc' });

// Only the base URL is stubbed. The header builders are deliberately left REAL:
// a mock that hardcodes them pins whatever the credential scheme happened to be
// when it was written, so the suite could never catch a builder that ignores the
// active scheme — which is the bug this whole task exists to prevent. That is
// exactly what the previous mock did: it hardcoded a credential-less
// buildHeaders, so it kept passing while the real one went unauthenticated.
vi.mock('@/auth/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  detectBaseUrl: () => 'http://localhost',
}));

// --- Imports ---

import { renderHook, act, waitFor } from '@testing-library/react';
import { setAuthMock, configureAuthMock } from '@/test/authContextMock.js';
import { declareCookieSession, expectNoAuthorizationHeader } from '@/test/sessionContract.js';
import { FavoritesProvider, useFavorites } from '../FavoritesContext.jsx';

// --- Helpers ---

function wrapper({ children }) {
  return <FavoritesProvider>{children}</FavoritesProvider>;
}

function putCalls() {
  return globalThis.fetch.mock.calls.filter((c) => c[1]?.method === 'PUT');
}

// --- Tests ---

describe('FavoritesContext', () => {
  beforeEach(() => {
    // ETP-4576 — declare the scheme this suite asserts on. The builders read the
    // active scheme, and src/test/setup.js resets it to the bearer default before
    // every test, so a suite expecting the CSRF proof has to say so.
    // This suite's fixture uses its own proof value, so the declared scheme must
    // carry the same one — setup.js publishes the mock baseline first, and the
    // declaration below is what wins.
    declareCookieSession('csrf-abc');
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

  describe('cookie session (ETP-4576)', () => {
    it('does not hit the server on mount when unauthenticated', async () => {
      setAuthMock({ username: 'testuser', isAuthenticated: false, csrfToken: null });

      renderHook(() => useFavorites(), { wrapper });

      await new Promise((r) => setTimeout(r, 0));
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('does not sync to the server when unauthenticated', async () => {
      setAuthMock({ username: 'testuser', isAuthenticated: false, csrfToken: null });
      const { result } = renderHook(() => useFavorites(), { wrapper });

      act(() => {
        result.current.addFavorite('product', 'Product');
      });

      // Local state and localStorage still work; only the network sync is gated.
      expect(result.current.favorites).toHaveLength(1);
      expect(putCalls()).toHaveLength(0);
    });

    it('fetches on mount when authenticated even though the client holds no token', async () => {
      setAuthMock({
        username: 'testuser',
        isAuthenticated: true,
        csrfToken: 'csrf-abc',
        token: null,
      });
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: 'remote-fav', label: 'Remote Fav' }],
      });

      const { result } = renderHook(() => useFavorites(), { wrapper });

      await waitFor(() => expect(result.current.favorites).toHaveLength(1));
      expect(result.current.favorites[0].name).toBe('remote-fav');
    });

    it('sends the X-Go-CSRF proof on the sync PUT', async () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });

      act(() => {
        result.current.addFavorite('product', 'Product');
      });

      const puts = putCalls();
      expect(puts).toHaveLength(1);
      expect(puts[0][1].headers['X-Go-CSRF']).toBe('csrf-abc');
    });

    it('omits X-Go-CSRF (without throwing) when no CSRF proof is available', async () => {
      // A session can be authenticated before the CSRF proof lands; the header
      // must be added defensively, never read off a null.
      setAuthMock({ username: 'testuser', isAuthenticated: true, csrfToken: null });
      const { result } = renderHook(() => useFavorites(), { wrapper });

      act(() => {
        result.current.addFavorite('product', 'Product');
      });

      const puts = putCalls();
      expect(puts).toHaveLength(1);
      expect(Object.keys(puts[0][1].headers)).not.toContain('X-Go-CSRF');
      expect(result.current.favorites).toHaveLength(1);
    });

    it('never sends an Authorization header on the mount fetch or the sync PUT', async () => {
      const { result } = renderHook(() => useFavorites(), { wrapper });

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      act(() => {
        result.current.addFavorite('product', 'Product');
      });

      expect(putCalls()).toHaveLength(1);
      expectNoAuthorizationHeader();
    });
  });
});
