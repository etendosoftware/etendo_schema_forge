import { useState, useEffect } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource.js';
import { readCredentialHeaders } from '../lib/sessionHeaders.js';

/**
 * Returns the org currency's Standard Precision from the /sws/neo/session endpoint.
 *
 * Fetches once per mount (the session endpoint is cheap — no polling). Falls back
 * to 2 if the endpoint is unavailable or the field is missing.
 *
 * @returns {number} Standard precision digit count (default: 2)
 */
export function useCurrencyPrecision() {
  const { isAuthenticated } = useAuth();
  const [precision, setPrecision] = useState(2);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const apiBase = getApiBase();
    (async () => {
      try {
        // ETP-4576 — the cookie alone is not the credential contract. Without
        // headers this identified no one under the bearer scheme, the session read
        // 401'd, and the hook fell back to a precision of 2 — a wrong number of
        // decimals on every amount, with nothing logged.
        const res = await fetch(`${apiBase}/sws/neo/session`, {
          credentials: 'include',
          headers: readCredentialHeaders(),
        });
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
  }, [isAuthenticated]);

  return precision;
}
