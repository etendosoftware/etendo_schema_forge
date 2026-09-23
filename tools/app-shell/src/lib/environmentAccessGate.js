/**
 * Environment-access gate (ETP-5443 follow-up).
 *
 * When an environment's commercial access is cut — the demo trial expired or the
 * subscription's payment grace elapsed — `NeoAuthenticator.enforceEnvironmentAccess`
 * (com.etendoerp.go) answers HTTP 402 to EVERY NEO request, with a JSON body shaped
 * `{ error: { message: "Environment access is not available: <DECISION>" } }` where
 * `<DECISION>` is one of `EnvironmentAccessPolicy.Decision` — `DEMO_TRIAL_EXPIRED`,
 * `SUBSCRIPTION_REQUIRED`, or `MEMBERSHIP_REQUIRED` (that last one is a different kind of
 * "no access" — the caller isn't a member of the environment at all — and is deliberately
 * NOT treated as a commercial block here; see `isBlockingAccessDecision`).
 *
 * Before this, nothing distinguished that 402 from any other fetch failure: it fell through
 * `fetchWindowAccess()`'s pre-existing `!res.ok -> null` branch (App.jsx), which
 * `AuthContext`'s `loadAccess()` folds into a plain `{}`, and `menuAccess: {}` is exactly the
 * same shape ETP-5375 uses for "a role that legitimately grants zero access" (as opposed to
 * `MENU_ACCESS_UNREACHABLE`, the sentinel for "could not tell"). So `useRoleMenu()` resolved
 * to a CONFIRMED empty Set and `AppLayout` rendered the "your role has no access" screen —
 * true of the Set, misleading about the reason.
 *
 * This module is the detection point. `fetchWindowAccess()` calls `/sws/neo/windowaccessmap`
 * on every session bootstrap AND every silent refresh (tab focus/visibility, the 5-min poll)
 * — the natural "session load" moment to capture the decision, BEFORE it collapses into that
 * generic `null`. Deliberately not read from `/sws/go/environments`' `accessState` instead:
 * that account-level, platform-token endpoint stays empty for a session that only ever went
 * through a direct tenant login (no platform token — see `useEnvironmentSwitch.js`), while
 * every blocked session, by definition, makes this exact NEO call and gets the 402.
 *
 * Kept free of React imports so it stays loadable by a plain `node --test` module; the React
 * binding lives in `hooks/useEnvironmentAccessGate.js`.
 */

const ENVIRONMENT_ACCESS_ERROR_PREFIX = 'Environment access is not available:';

// MEMBERSHIP_REQUIRED intentionally excluded — it means "you aren't a member of this
// environment", not "this environment's commercial access was cut off". The existing
// NoAccessScreen company-switch flow already covers that case well enough.
const BLOCKING_DECISIONS = new Set(['DEMO_TRIAL_EXPIRED', 'SUBSCRIPTION_REQUIRED']);

let currentDecision = null;
const listeners = new Set();

function notify() {
  // Copy before iterating: a listener may unsubscribe itself while being notified.
  for (const listener of [...listeners]) listener();
}

/**
 * Extracts the `EnvironmentAccessPolicy.Decision` name from a NEO 402 error message
 * (`"Environment access is not available: <DECISION>"` — see `NeoAuthenticator
 * .enforceEnvironmentAccess`). Returns `null` when the message does not carry a
 * recognized decision (a differently-worded 402, or none at all).
 */
export function parseEnvironmentAccessDecision(message) {
  const text = String(message ?? '');
  if (!text.startsWith(ENVIRONMENT_ACCESS_ERROR_PREFIX)) return null;
  const decision = text.slice(ENVIRONMENT_ACCESS_ERROR_PREFIX.length).trim();
  return decision || null;
}

/** Whether `decision` should replace the normal UI with the blocked-access screen. */
export function isBlockingAccessDecision(decision) {
  return BLOCKING_DECISIONS.has(decision);
}

/**
 * Records the outcome of the latest windowaccessmap call. Pass `null` (or any
 * non-blocking value, e.g. `MEMBERSHIP_REQUIRED`) when the call succeeded, or failed for a
 * reason other than a recognized commercial-access 402, so a later-restored or
 * unrelated-error session does not keep showing a stale block. No-op (and no listener
 * notification) when the resolved value is unchanged, since this is called on every silent
 * refresh (bootstrap, focus, the 5-min poll), not just on state transitions.
 */
export function setEnvironmentAccessDecision(decision) {
  const next = isBlockingAccessDecision(decision) ? decision : null;
  if (next === currentDecision) return;
  currentDecision = next;
  notify();
}

/** The current blocking decision (`'DEMO_TRIAL_EXPIRED'` | `'SUBSCRIPTION_REQUIRED'`), or `null`. */
export function getEnvironmentAccessDecision() {
  return currentDecision;
}

/** Subscribe to changes in the recorded decision. Returns the unsubscribe function. */
export function subscribeEnvironmentAccessDecision(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: forget the recorded decision so one test cannot leak into the next. */
export function resetEnvironmentAccessGateForTest() {
  currentDecision = null;
  listeners.clear();
}
