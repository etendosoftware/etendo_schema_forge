/**
 * Instance-wide currency number-formatting configuration (thousands/decimal separators).
 *
 * Fetched once from NEO Headless (`GET /sws/neo/currency-format`) and cached in memory
 * for the rest of the session — this is the single source of truth for `formatCurrency()`'s
 * grouping/decimal separators, mirroring the same config `report-api.js` fetches server-side
 * before building a jsreport payload. Both sides read from the same instance-level config
 * instead of hardcoding the separators independently.
 *
 * Fetch is fire-and-forget and fails soft: if the endpoint is unreachable, callers keep
 * using the default es-ES-style separators (`.`/`,`) — a config outage must never break
 * currency rendering.
 *
 * Deliberately does NOT import `detectBaseUrl` from `@/auth/api.js` — that module
 * transitively re-exports `.jsx` files, which plain `node --test` (used by
 * formatCurrency.js's own test suite) can't load at all. `detectBaseUrl` is a
 * two-line check, so it's inlined here instead of shared.
 */

function detectBaseUrl() {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) return path.substring(0, webIdx);
  return import.meta.env?.VITE_API_BASE || '';
}

const DEFAULT_SEPARATORS = Object.freeze({ thousandsSeparator: '.', decimalSeparator: ',' });

let cachedSeparators = DEFAULT_SEPARATORS;
let fetchPromise = null;

/**
 * Returns the currently cached separators synchronously — defaults until the fetch
 * below resolves, then the real configured values for the rest of the session.
 *
 * @returns {{ thousandsSeparator: string, decimalSeparator: string }}
 */
export function getCurrencyFormatConfig() {
  return cachedSeparators;
}

/**
 * Fetches the instance currency-format config once and caches it. Safe to call multiple
 * times (e.g. on every AppLayout mount) — subsequent calls reuse the in-flight/settled
 * promise instead of re-fetching.
 *
 * @returns {Promise<{ thousandsSeparator: string, decimalSeparator: string }>}
 */
export function fetchCurrencyFormatConfig() {
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch(`${detectBaseUrl()}/sws/neo/currency-format`)
    .then((res) => {
      if (!res.ok) throw new Error(`currency-format fetch failed: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      cachedSeparators = {
        thousandsSeparator: typeof data?.thousandsSeparator === 'string' ? data.thousandsSeparator : DEFAULT_SEPARATORS.thousandsSeparator,
        decimalSeparator: typeof data?.decimalSeparator === 'string' ? data.decimalSeparator : DEFAULT_SEPARATORS.decimalSeparator,
      };
      return cachedSeparators;
    })
    .catch(() => {
      // Fails soft — keep defaults, never throw into a fire-and-forget caller.
      cachedSeparators = DEFAULT_SEPARATORS;
      return cachedSeparators;
    });

  return fetchPromise;
}
