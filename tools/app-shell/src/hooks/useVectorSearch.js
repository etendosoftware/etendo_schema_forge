import { useEffect, useState } from 'react';
import { getApiBase } from '@/hooks/useNeoResource.js';

const VECTOR_MAX_RESULTS = 10;
const VECTOR_FETCH_MIN_SCORE = 0.45;

export function useVectorSearch({ query, requestedTargetKeys, selectedTargetKeys, onSearch }) {
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (requestedTargetKeys.length === 0 || normalizedQuery.length < 3) {
      setMatches([]);
      setIsLoading(false);
      return undefined;
    }

    setMatches([]);
    setIsLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const token = localStorage.getItem('sf_auth_token');
        const queryTargets = selectedTargetKeys === null && requestedTargetKeys.length > 1
          ? requestedTargetKeys.map((target) => [target])
          : [requestedTargetKeys];
        const payloads = await Promise.all(queryTargets.map(async (targets) => {
          const params = new URLSearchParams({
            query: normalizedQuery,
            targets: targets.join(','),
            minScore: String(VECTOR_FETCH_MIN_SCORE),
            maxResults: String(VECTOR_MAX_RESULTS),
          });
          const response = await fetch(`${getApiBase()}/sws/neo/vectorsearch?${params}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Vector search failed: ${response.status}`);
          return response.json();
        }));
        const nextMatches = payloads.flatMap((payload) => Array.isArray(payload?.matches) ? payload.matches : [])
          .filter((match) => Number.isFinite(Number(match.score)))
          .sort((left, right) => Number(right.score) - Number(left.score))
          .slice(0, VECTOR_MAX_RESULTS);
        setMatches(nextMatches);
        onSearch?.(normalizedQuery, requestedTargetKeys);
      } catch (error) {
        if (error.name !== 'AbortError') setMatches([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [onSearch, query, requestedTargetKeys, selectedTargetKeys]);

  return { matches, isLoading };
}
