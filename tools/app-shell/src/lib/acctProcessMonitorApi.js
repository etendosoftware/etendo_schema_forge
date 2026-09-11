import { NEO_BASE, fetchNeoWebhookJson } from './neoWebhookClient.js';

/**
 * ETP-5269 — client for `SFAcctProcessMonitor` (`GET /sws/neo/acctprocessmonitor`), the
 * accounting-server-process status/history endpoint and its manual trigger.
 *
 * Shared fetch/parse/unwrap mechanics (base URL, fresh token per call, the
 * `{result: "<json-string>"}` envelope) live in `neoWebhookClient.js`'s `fetchNeoWebhookJson` —
 * see that module for the full rationale.
 *
 * **A denial is a payload, not a throw.** Like every webhook in this family, a non-admin caller
 * gets `{ error: true, message: 'Not authorized' }` back on an HTTP 200 rather than a 403, so
 * callers must branch on `payload.error` and render the no-access state — not treat it as a fetch
 * failure. The backend (`NeoAccessHelper.isAdminOrClientAdmin`) is the real authorization
 * boundary; the frontend feature flag only decides whether the menu entry is offered.
 */

// This endpoint always answers with an object (status payload or the denial shape), so there is no
// alternative top-level array form to recognise — unlike `rolesApi.js`, whose webhooks can answer
// with a bare `{roles: [...]}`. Steps 4/5 of the shared unwrap already cover everything valid here.
const noFallback = () => null;

/**
 * Reads the accounting process's current status and recent run history.
 *
 * @param {number} [limit] - how many history rows to request. The backend clamps this to its own
 *   maximum (100) and falls back to its default (20) for anything unparseable, so an out-of-range
 *   value here is safe rather than an error.
 * @returns {Promise<{error: boolean, message?: string, processName?: string, scheduled?: boolean,
 *   nextRunTime?: string|null, running?: boolean,
 *   lastRun?: {id: string, status: string, startTime: string|null, endTime: string|null,
 *     duration: string|null, manual: boolean}|null,
 *   history?: Array<{id: string, status: string, startTime: string|null, endTime: string|null,
 *     duration: string|null, manual: boolean}>}>}
 */
export async function fetchAcctProcessStatus(limit) {
  const query = limit ? `?Limit=${encodeURIComponent(limit)}` : '';
  return fetchNeoWebhookJson(
    `${NEO_BASE}/acctprocessmonitor${query}`,
    'SFAcctProcessMonitor',
    noFallback
  );
}

/**
 * Launches a manual run and returns the refreshed status payload in the same round trip.
 *
 * The run is a SEPARATE one-shot `AD_PROCESS_REQUEST` scheduled to start immediately; the
 * recurring every-5-minutes schedule is never touched. See `SFAcctProcessMonitor`'s class javadoc
 * in `com.etendoerp.go` for why that mechanism was chosen.
 *
 * **The run is scoped to the caller's own company.** Unlike the automatic cadence — which runs in
 * the System context and therefore posts every tenant — a manual run posts only the calling
 * client's pending accounting. The backend derives that client from the session, so there is no
 * client parameter here to get wrong or to tamper with.
 *
 * **The trigger can legitimately refuse.** A successful HTTP response still carries
 * `triggered.started === false` when the backend declined — `triggered.reason` is then one of
 * `alreadyRunning`, `notScheduled`, `schedulerUnavailable`, `systemClientNotScopable` or
 * `scheduleFailed`. Callers must surface that as a message, never assume a 200 means the run began.
 *
 * `Action=trigger` is required explicitly: a bare GET to this endpoint only reads. That keeps an
 * accidental, prefetched or retried request from firing the process.
 *
 * @param {number} [limit] - history rows to return alongside the trigger outcome.
 * @returns {Promise<object>} the same shape as {@link fetchAcctProcessStatus}, plus a
 *   `triggered: {started: boolean, reason: string}` field.
 */
export async function triggerAcctProcessRun(limit) {
  const limitQuery = limit ? `&Limit=${encodeURIComponent(limit)}` : '';
  return fetchNeoWebhookJson(
    `${NEO_BASE}/acctprocessmonitor?Action=trigger${limitQuery}`,
    'SFAcctProcessMonitor',
    noFallback
  );
}
