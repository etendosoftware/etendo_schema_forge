/**
 * ETP-4520 — Resolves whether a `visibleWhenCapability`-gated field/column/pill
 * should render, given the `capabilities` map from `useAuth()`
 * (`@etendosoftware/app-shell-core/auth`, populated via the SFWindowAccessMap
 * webhook — see `App.jsx`'s `fetchWindowAccess`).
 *
 * Plain function (not a hook) so callers can pull `capabilities` once via
 * `useCapabilitiesSafe()` (`@/hooks/useCapabilitiesSafe.js`) at the top of the
 * component and gate as many entries as needed per render, without violating
 * the rules of hooks (`useHasCapability` can't be called a variable number of
 * times). Kept dependency-free (no `@/` imports) so it can be covered by a
 * plain `node --test` unit test alongside this repo's other `src/lib/`
 * helpers — the hook counterpart lives separately for that reason.
 *
 * - No `key` → opt-in feature, default visible (`true`).
 * - `key` present → fails CLOSED: only an explicit `capabilities[key] === true`
 *   is visible. An unloaded map ({}) or a missing/falsy key both resolve
 *   `false`, matching `useHasCapability`'s fail-closed contract.
 *
 * @param {Record<string, boolean>|null|undefined} capabilities
 * @param {string|null|undefined} key
 * @returns {boolean}
 */
export function isCapabilityVisible(capabilities, key) {
  if (!key) return true;
  return capabilities?.[key] === true;
}
