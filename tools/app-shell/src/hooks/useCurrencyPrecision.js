import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

/**
 * Returns the org currency's Standard Precision from the /sws/neo/session endpoint.
 *
 * Fetches once per mount (the session endpoint is cheap — no polling). Falls back
 * to 2 if the endpoint is unavailable or the field is missing.
 *
 * @returns {number} Standard precision digit count (default: 2)
 */
export function useCurrencyPrecision() {
  const { token } = useAuth();
  const apiBase = useMemo(() => getApiBase(), []);
  const apiFetch = useApiFetch(apiBase);
  const [precision, setPrecision] = useState(2);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/sws/neo/session');
        if (cancelled || !res.ok) return;
        const json = await res.json();
        const value = json?.currencyStandardPrecision;
        if (typeof value === 'number' && value >= 0) {
          setPrecision(value);
        }
      } catch {
        // silently keep the default
      }
    })();
    return () => { cancelled = true; };
  }, [token, apiFetch]);

  return precision;
}
