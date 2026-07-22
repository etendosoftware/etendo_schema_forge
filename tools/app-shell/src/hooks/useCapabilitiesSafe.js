import { useAuth } from '@/auth/AuthContext.jsx';

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
 * @returns {Record<string, boolean>}
 */
export function useCapabilitiesSafe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see comment above
    return useAuth().capabilities || {};
  } catch {
    return {};
  }
}
