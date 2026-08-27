import { authHeaders } from '@etendosoftware/app-shell-core/auth/api';
/**
 * Instance-wide currency number-formatting configuration (thousands/decimal separators,
 * and the per-currency symbol side).
 *
 * Part of the CANONICAL currency-formatting path (see `formatCurrency.js`'s banner
 * comment / CLAUDE.md § Currency & Amount Formatting). Never fetch this endpoint or
 * hardcode separators anywhere else — consume `getCurrencyFormatConfig()` instead.
 *
 * Fetched once from NEO Headless (`GET /sws/neo/currency-format`) and cached in memory
 * for the rest of the session — this is the single source of truth for `formatCurrency()`'s
 * grouping/decimal separators, mirroring the same config `report-api.js` fetches server-side
 * before building a jsreport payload. Both sides read from the same instance-level config
 * instead of hardcoding the separators independently.
 *
 * The response also carries `symbolRightSide`, a `{ [isoCode]: boolean }` map sourced from
 * Etendo Classic's own `C_CURRENCY.ISSYMBOLRIGHTSIDE` column — the app doesn't hardcode which
 * currencies go left vs. right (ETP-4314 follow-up: EUR is the only currency shipped with
 * `Y`; every other currency, USD/GBP/ARS/etc. included, ships `N`).
 *
 * Fetch is fire-and-forget and fails soft: if the endpoint is unreachable, callers keep
 * using the default es-ES-style separators (`.`/`,`) and every currency renders symbol-after
 * (the pre-fix behavior) — a config outage must never break currency rendering.
 *
 * Imports `authHeaders` from `@etendosoftware/app-shell-core/auth/api`, NOT from
 * `@/auth/api.js`. The local alias re-exports the core's `auth` barrel, which pulls in
 * `.jsx` files that plain `node --test` (used by formatCurrency.js's own test suite)
 * cannot load — so importing it here would make this whole module unloadable in that
 * suite. The `./auth/api` subpath points straight at the module and has no `.jsx` in
 * its graph (ETP-5022).
 *
 * `detectBaseUrl` stays inlined below: it is a two-line check, and it predates the
 * subpath existing.
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
// Empty until a fetch resolves — absence of a code here means "unknown", which
// isCurrencySymbolRightSide() below treats as right-side (today's behavior),
// never as an assumed left-side, to avoid flashing the wrong side for EUR
// (the overwhelmingly common case in this instance) before hydration.
let cachedSymbolRightSide = {};
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
 * Whether a currency's symbol should render on the right of the amount (e.g. `1,00 €`)
 * rather than the left (e.g. `$1,00`), per `C_CURRENCY.ISSYMBOLRIGHTSIDE`.
 *
 * Defaults to `true` (right side) for any code not yet loaded or absent from the
 * fetched map — same reasoning as `DEFAULT_SEPARATORS`: never assume a config we
 * don't have yet.
 *
 * @param {string} currencyCode - ISO 4217 currency code (e.g. "USD", "EUR").
 * @returns {boolean}
 */
export function isCurrencySymbolRightSide(currencyCode) {
  const value = cachedSymbolRightSide[currencyCode];
  return value !== false;
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

  fetchPromise = fetch(`${detectBaseUrl()}/sws/neo/currency-format`, { headers: authHeaders() })
    .then((res) => {
      if (!res.ok) throw new Error(`currency-format fetch failed: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      cachedSeparators = {
        thousandsSeparator: typeof data?.thousandsSeparator === 'string' ? data.thousandsSeparator : DEFAULT_SEPARATORS.thousandsSeparator,
        decimalSeparator: typeof data?.decimalSeparator === 'string' ? data.decimalSeparator : DEFAULT_SEPARATORS.decimalSeparator,
      };
      cachedSymbolRightSide = (data?.symbolRightSide && typeof data.symbolRightSide === 'object') ? data.symbolRightSide : {};
      return cachedSeparators;
    })
    .catch(() => {
      // Fails soft — keep defaults, never throw into a fire-and-forget caller.
      cachedSeparators = DEFAULT_SEPARATORS;
      cachedSymbolRightSide = {};
      return cachedSeparators;
    });

  return fetchPromise;
}
