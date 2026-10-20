/**
 * Environment-access gate — the store is re-exported from the core (ETP-5642); the structured
 * body reader is this repo's (ETP-5047).
 *
 * The store moved to `@etendosoftware/app-shell-core/lib/environmentAccessGate.js` so the core's
 * `apiFetch` can record a commercial-access 402 from ANY response, not only from
 * `/sws/neo/windowaccessmap` (see that module for the full detection story). It is a
 * module-level store, so there must be exactly one copy: this file only re-exports it, keeping
 * the `@/lib/environmentAccessGate.js` import every consumer here already uses. Never re-declare
 * the store in this repo — a second copy would be written by the transport and never read by
 * `AppLayout`, and the blocked-access screen would silently stop appearing.
 *
 * Wire format (ETP-5047). When an environment's commercial access is cut, com.etendoerp.go
 * refuses with HTTP 402 through `EnvironmentAccessGuard` (`payment/EnvironmentAccessGuard.java`;
 * NEO reaches it via `EnvironmentRequestAuthenticator` from `NeoAuthenticator
 * .authenticateRequest`, MCP via `McpServlet`). Every refusing surface answers the one shared
 * body, `EnvironmentAccessGuard.Denial.errorBody`:
 * `{ error: { message: "Environment access is not available: <DECISION>", status: 402,
 * code: "ENVIRONMENT_ACCESS_DENIED", decision: "<DECISION>" } }`, where `<DECISION>` is one of
 * `EnvironmentAccessPolicy.Decision` — `DEMO_TRIAL_EXPIRED`, `SUBSCRIPTION_REQUIRED`, or
 * `MEMBERSHIP_REQUIRED` (not a commercial block; see `isBlockingAccessDecision`). The `message`
 * text is unchanged since ETP-5443, so the core's transport-level detection
 * (`observeEnvironmentAccessResponse`, which parses the message prefix out of any envelope via
 * `readAccessErrorMessage` — NEO's `{ error: { message } }` or a plain-string `{ error }`) keeps
 * recognising it. `readEnvironmentAccessDecision` below is what `fetchWindowAccess()` (App.jsx)
 * uses: it reads the structured `error.decision` first and falls back to the message prefix,
 * which is all a pre-ETP-5047 backend sends — keep the fallback for one release after ETP-5047 is
 * deployed everywhere. It is a pure function, not a second store.
 */
import {
  parseEnvironmentAccessDecision,
  readAccessErrorMessage,
} from '@etendosoftware/app-shell-core/lib/environmentAccessGate.js';

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

// ETP-5047 — `EnvironmentAccessGuard.ERROR_CODE` (com.etendoerp.go).
const ENVIRONMENT_ACCESS_ERROR_CODE = 'ENVIRONMENT_ACCESS_DENIED';

/**
 * ETP-5047 — extracts the `EnvironmentAccessPolicy.Decision` name from a parsed 402 error body.
 * Reads the structured `error.code` / `error.decision` first; when the body carries no
 * structured decision (a pre-ETP-5047 backend), falls back to parsing the message text — from
 * `error` itself when it is a string, else from `error.message`, else from a top-level `message`
 * (the core's `readAccessErrorMessage` envelope handling). Returns `null` when neither yields a
 * decision. Never throws on an unexpected shape.
 */
export function readEnvironmentAccessDecision(body) {
  const error = body?.error;
  if (error && typeof error === 'object'
      && error.code === ENVIRONMENT_ACCESS_ERROR_CODE
      && typeof error.decision === 'string' && error.decision.trim()) {
    return error.decision.trim();
  }
  return parseEnvironmentAccessDecision(readAccessErrorMessage(body));
}
