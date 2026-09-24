import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { detectBaseUrl } from '@/auth/api.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

const FavoritesContext = createContext(null);

const STORAGE_PREFIX = 'sf_favorites_';
const FAVORITES_ENDPOINT = `${detectBaseUrl()}/sws/neo/favorites`;

function storageKey(username) {
  return `${STORAGE_PREFIX}${username || 'anonymous'}`;
}

function readFavorites(username) {
  try {
    const raw = localStorage.getItem(storageKey(username));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((f) => f && typeof f.name === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeFavorites(username, list) {
  try {
    localStorage.setItem(storageKey(username), JSON.stringify(list));
  } catch {
    /* ignore quota/availability errors */
  }
}

export function FavoritesProvider({ children }) {
  const { username, token } = useAuth();
  const [favorites, setFavorites] = useState(() => readFavorites(username));
  const fetchedRef = useRef(false);
  const apiFetch = useApiFetch();

  // Reset to localStorage when user changes (login/logout)
  useEffect(() => {
    fetchedRef.current = false;
    setFavorites(readFavorites(username));
  }, [username]);

  // Fetch from server on login — server wins over localStorage
  useEffect(() => {
    if (!username || fetchedRef.current) return;
    let cancelled = false;
    apiFetch(FAVORITES_ENDPOINT, { baseUrl: '' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          fetchedRef.current = true;
          writeFavorites(username, data);
          setFavorites(data);
        }
      })
      .catch(() => {
        /* localStorage fallback stays active */
      });
    return () => {
      cancelled = true;
    };
  }, [token, username, apiFetch]);

  const syncToServer = useCallback(
    (list) => {
      apiFetch(FAVORITES_ENDPOINT, {
        method: 'PUT',
        baseUrl: '',
        body: JSON.stringify(list),
      }).catch(() => {});
    },
    [token, apiFetch]
  );

  const addFavorite = useCallback(
    (name, label, labels) => {
      if (!name) return;
      if (favorites.some((f) => f.name === name)) return;
      const entry = labels ? { name, label: label || name, labels } : { name, label: label || name };
      const next = [...favorites, entry];
      setFavorites(next);
      writeFavorites(username, next);
      syncToServer(next);
    },
    [favorites, username, syncToServer]
  );

  const removeFavorite = useCallback(
    (name) => {
      if (!name) return;
      const next = favorites.filter((f) => f.name !== name);
      setFavorites(next);
      writeFavorites(username, next);
      syncToServer(next);
    },
    [favorites, username, syncToServer]
  );

  const toggleFavorite = useCallback(
    (name, label, labels) => {
      if (!name) return;
      const exists = favorites.some((f) => f.name === name);
      const entry = labels ? { name, label: label || name, labels } : { name, label: label || name };
      const next = exists
        ? favorites.filter((f) => f.name !== name)
        : [...favorites, entry];
      setFavorites(next);
      writeFavorites(username, next);
      syncToServer(next);
    },
    [favorites, username, syncToServer]
  );

  const isFavorite = useCallback(
    (name) => favorites.some((f) => f.name === name),
    [favorites]
  );

  const value = useMemo(
    () => ({ favorites, addFavorite, removeFavorite, toggleFavorite, isFavorite }),
    [favorites, addFavorite, removeFavorite, toggleFavorite, isFavorite]
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    return {
      favorites: [],
      addFavorite: () => {},
      removeFavorite: () => {},
      toggleFavorite: () => {},
      isFavorite: () => false,
    };
  }
  return ctx;
}
