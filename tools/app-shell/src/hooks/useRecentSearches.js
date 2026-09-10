import { useCallback, useState } from 'react';

const RECENT_SEARCHES_KEY = 'schema-forge:recent-searches';
const MAX_RECENT_SEARCHES = 5;

function readRecentSearches() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => item && typeof item.query === 'string') : [];
  } catch {
    return [];
  }
}

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);
  const addRecentSearch = useCallback((query, targets) => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) return;
    setRecentSearches((current) => {
      const next = [
        { query: normalizedQuery, targets, timestamp: Date.now() },
        ...current.filter((item) => item.query.toLowerCase() !== normalizedQuery.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);
      try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);
  return { recentSearches, addRecentSearch };
}
