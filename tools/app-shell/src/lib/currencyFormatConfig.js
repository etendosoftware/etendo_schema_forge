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
 * Deliberately does NOT import `detectBaseUrl` from `@/auth/api.js` — that module
 * transitively re-exports `.jsx` files, which plain `node --test` (used by
 * formatCurrency.js's own test suite) can't load at all. `detectBaseUrl` is a
 * two-line check, so it's inlined here instead of shared.
 */
// Safe under plain `node --test` despite the caveat above: sessionHeaders.js only
// re-exports the credential builders from app-shell-core's `sessionCredentials`
// LEAF, which is JSX-free and published as its own subpath for exactly this reason.
import { readCredentialHeaders } from './sessionHeaders.js';

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

  // ETP-4576 — this went out bare: no credential and not even `credentials`, so it
  // depended on same-origin cookie defaults and sent nothing identifying under the
  // bearer scheme. A 401 here is silent by design (the catch below falls back to
  // the built-in separators), so the symptom is amounts formatted with the wrong
  // thousands/decimal marks rather than an error anyone would notice.
  fetchPromise = fetch(`${detectBaseUrl()}/sws/neo/currency-format`, {
    credentials: 'include',
    headers: readCredentialHeaders(),
  })
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
