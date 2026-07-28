import { useAuth } from '@/auth/AuthContext.jsx';

// ETP-4520 — a single shared empty-map reference for both fallback paths
// below, so callers that memoize on the returned `capabilities` object
// (`useMemo`/`useCallback` deps, e.g. DataTable.jsx) see a stable reference
// across renders instead of a fresh `{}` literal every time, which would
// defeat that memoization even when nothing actually changed.
const EMPTY_CAPABILITIES = Object.freeze({});

// ETP-4520 — the exact message `useAuth()` throws (AuthContext.jsx in
// schema_forge_core, ~line 126) when called with no `AuthProvider` ancestor.
// AuthContext.jsx does not export an error class/constant to match against,
// so this is a hardcoded string match — a minor coupling to that literal.
// If it ever changes, this hook stops recognizing the expected case and
// starts rethrowing it (fails loud, not silently swallowing something new).
const NO_AUTH_PROVIDER_MESSAGE = 'useAuth must be used within AuthProvider';

/**
 * ETP-4520 — Reads `capabilities` off `useAuth()` without requiring the
 * caller to be wrapped in `AuthProvider`. `useAuth()` throws when no provider
 * is present in the tree — which the real running app never hits
 * (AppShellRuntime always wraps everything in AuthProvider) but which many
 * pre-existing DataTable / DetailView unit tests do, since those components
 * are otherwise fully prop-driven and are mounted directly without an
 * AuthProvider ancestor.
 *
 * `useAuth()` is still called unconditionally on every render (same call,
 * same position, every time) — only the exception it may throw is handled,
 * which does not violate the rules of hooks. Falls back to `{}`, which
 * `isCapabilityVisible` (`@/lib/capabilityVisibility.js`) already treats as
 * "nothing loaded" (fail closed).
 *
 * Only the specific "no AuthProvider" error is swallowed — any other error
 * (e.g. a real bug inside `AuthContext`/`useAuth()` itself) is rethrown so it
 * surfaces as an actual failure instead of silently looking like "no
 * capabilities loaded".
 *
 * @returns {Record<string, boolean>}
 */
export function useCapabilitiesSafe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see comment above
    return useAuth().capabilities || EMPTY_CAPABILITIES;
  } catch (err) {
    if (err instanceof Error && err.message === NO_AUTH_PROVIDER_MESSAGE) {
      return EMPTY_CAPABILITIES;
    }
    throw err;
  }
}
