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

/**
 * ETP-5684 — the capability that gates every accounting surface (posting
 * status and posting actions). Served by `SFWindowAccessMap` as
 * `capabilities.showAccountingFields`, derived from `AD_Role.EM_ETGO_Show_Acct_Fields`.
 */
export const ACCOUNTING_CAPABILITY = 'showAccountingFields';

/**
 * ETP-5889 — the capability that switches on the Product window's Movements tab. Served by
 * `SFWindowAccessMap` as `capabilities.productMovements`: the backend evaluates the per-account feature
 * flag `product-movements-tab` and the browser never does, so both ends always agree. Fails closed.
 */
export const PRODUCT_MOVEMENTS_CAPABILITY = 'productMovements';

// The generic posting actions served by `DocumentPostingService` for every
// postable document. A structural contract, not an entity name.
const POSTING_ACTIONS = new Set(['post', 'unpost']);

/**
 * ETP-5684 — whether an action descriptor posts or unposts a document.
 * Menu and row descriptors carry it as `neoAction`; bulk descriptors
 * (`BulkDocumentAction`) carry it as `value`. The `key` is not read: it is a
 * free label that a non-posting action could also use.
 *
 * @param {object|null|undefined} action
 * @returns {boolean}
 */
export function isPostingAction(action) {
  return POSTING_ACTIONS.has(action?.neoAction) || POSTING_ACTIONS.has(action?.value);
}

/**
 * ETP-5684 — drops the posting actions when the role cannot see accounting.
 * Returns the same array when nothing is dropped, so memoized callers keep a
 * stable reference. Fails closed like `isCapabilityVisible`.
 *
 * @template T
 * @param {T[]|null|undefined} actions
 * @param {Record<string, boolean>|null|undefined} capabilities
 * @returns {T[]|null|undefined}
 */
export function filterPostingActions(actions, capabilities) {
  if (!Array.isArray(actions) || isCapabilityVisible(capabilities, ACCOUNTING_CAPABILITY)) return actions;
  return actions.filter(a => !isPostingAction(a));
}
