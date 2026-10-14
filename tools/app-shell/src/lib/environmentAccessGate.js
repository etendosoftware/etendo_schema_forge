/**
 * Environment-access gate — re-exported from the core (ETP-5642).
 *
 * The store moved to `@etendosoftware/app-shell-core/lib/environmentAccessGate.js` so the core's
 * `apiFetch` can record a commercial-access 402 from ANY response, not only from
 * `/sws/neo/windowaccessmap` (see that module for the full detection story). It is a
 * module-level store, so there must be exactly one copy: this file only re-exports it, keeping
 * the `@/lib/environmentAccessGate.js` import every consumer here already uses. Never re-declare
 * the store in this repo — a second copy would be written by the transport and never read by
 * `AppLayout`, and the blocked-access screen would silently stop appearing.
 */
export {
  getEnvironmentAccessDecision,
  isBlockingAccessDecision,
  observeEnvironmentAccessResponse,
  parseEnvironmentAccessDecision,
  readAccessErrorMessage,
  resetEnvironmentAccessGateForTest,
  setEnvironmentAccessDecision,
  subscribeEnvironmentAccessDecision,
} from '@etendosoftware/app-shell-core/lib/environmentAccessGate.js';
