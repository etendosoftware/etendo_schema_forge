/**
 * ETP-5576 — follow-up documents: the pure, React-free half of the generic flow that offers
 * the user the document that naturally follows a completed one (invoice → shipment /
 * receipt today; order → shipment / invoice and shipment → invoice later).
 *
 * The backend decides WHAT is pending. Every record of a spec that supports follow-ups
 * carries a `followUp` annotation on its header GET:
 *
 *   followUp: {
 *     available: ['shipment'],               // keys with needed=true, in display order
 *     shipment: { needed: true, reason: null, pendingLines: 2,
 *                 action: 'createShipment', targetSpec: 'goods-shipment',
 *                 targetEntity: 'goodsShipment' },
 *   }
 *
 * and `POST <spec>/<entity>/{id}/action/<action>` creates the follow-up document (a Draft
 * with only the pending lines). The frontend never re-derives "pending": a credit note, a
 * return or a fully delivered invoice simply comes back with an empty `available`.
 *
 * Dependency-free on purpose (no `@/` alias, no React) so plain `node --test` can import it.
 */

/** Window event a draftMode `afterProcess` uses to ask the follow-up UI to open. */
export const FOLLOW_UP_PROMPT_EVENT = 'neo:follow-up-prompt';

/**
 * The follow-up entries the backend currently offers for `record`, in display order.
 * Keys listed in `available` without an `action` (or explicitly `needed: false`) are
 * dropped — the action URL could not be built for them.
 *
 * @param {object|null|undefined} record
 * @returns {Array<{key: string, needed?: boolean, reason?: string|null, pendingLines?: number,
 *   action: string, targetSpec?: string, targetEntity?: string}>}
 */
export function readFollowUpEntries(record) {
  const followUp = record?.followUp;
  if (!followUp || !Array.isArray(followUp.available)) return [];
  return followUp.available
    .map((key) => ({ ...(followUp[key] || {}), key }))
    .filter((entry) => entry.needed !== false && typeof entry.action === 'string' && entry.action);
}

/**
 * Entries the window knows how to present: the backend may annotate a key a window has
 * not configured yet (a new follow-up type rolled out server-side first) — such a key is
 * ignored rather than rendered with missing labels.
 */
export function readConfiguredFollowUpEntries(record, options = {}) {
  return readFollowUpEntries(record).filter((entry) => Boolean(options?.[entry.key]));
}

export function hasPendingFollowUp(record, options) {
  return options
    ? readConfiguredFollowUpEntries(record, options).length > 0
    : readFollowUpEntries(record).length > 0;
}

// Plain string scans instead of regexes: an end-anchored "one or more slashes" pattern
// backtracks super-linearly on long slash runs (Sonar S5852).
function stripTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

// Drops the last `/segment`; a value without any '/' is returned unchanged.
function dropLastPathSegment(value) {
  const slash = value.lastIndexOf('/');
  return slash === -1 ? value : value.slice(0, slash);
}

/**
 * `POST {neoBase}/{spec}/{entity}/{id}/action/{action}`. `apiBaseUrl` is the spec-scoped
 * NEO base the window receives (`.../sws/neo/<spec>`); the spec segment is replaced with
 * the explicit `spec` so the URL never depends on which window's base was handed in — the
 * same construction InvoiceTopbarExtra used for `createShipment`.
 */
export function buildFollowUpActionUrl({ apiBaseUrl, spec, entity = 'header', recordId, action }) {
  const neoBase = dropLastPathSegment(stripTrailingSlashes(String(apiBaseUrl || '')));
  return `${neoBase}/${spec}/${entity}/${encodeURIComponent(recordId)}/action/${encodeURIComponent(action)}`;
}

/** Backend error code → genericLabels key. Anything else falls back to the generic key. */
export const FOLLOW_UP_ERROR_KEYS = {
  FOLLOW_UP_SOURCE_NOT_FOUND: 'followUpErrorSourceNotFound',
  FOLLOW_UP_WRONG_DIRECTION: 'followUpErrorWrongDirection',
  FOLLOW_UP_SOURCE_NOT_COMPLETED: 'followUpErrorSourceNotCompleted',
  FOLLOW_UP_SOURCE_TYPE_NOT_ELIGIBLE: 'followUpErrorSourceTypeNotEligible',
  FOLLOW_UP_NOTHING_PENDING: 'followUpErrorNothingPending',
  FOLLOW_UP_DRAFT_IN_PROGRESS: 'followUpErrorDraftInProgress',
  FOLLOW_UP_MISSING_SETUP: 'followUpErrorMissingSetup',
};
export const FOLLOW_UP_GENERIC_ERROR_KEY = 'followUpErrorGeneric';

/** The error code of a NEO error body (`{error:{code}}`, or the older `{response:{error}}`). */
export function readFollowUpErrorCode(body) {
  return body?.error?.code ?? body?.response?.error?.code ?? null;
}

/** Translated message for a failed follow-up action, never the raw backend text. */
export function followUpErrorMessage(body, ui) {
  const key = FOLLOW_UP_ERROR_KEYS[readFollowUpErrorCode(body)] ?? FOLLOW_UP_GENERIC_ERROR_KEY;
  return ui?.(key) || key;
}

/** The created document from a 201 body (`{response:{data:{id, documentNo, …}}}`). */
export function readCreatedDocument(body) {
  const data = body?.response?.data;
  const doc = Array.isArray(data) ? data[0] : data;
  return doc && typeof doc === 'object' && doc.id ? doc : null;
}

// ── Prompt hand-off (afterProcess → follow-up UI) ──────────────────────────────
//
// `afterProcess` runs inside the Confirm click (saveActions.jsx), the follow-up UI lives
// in the window's topbar. A pending prompt is kept here, keyed by spec + record id, and a
// window event announces it: an already-mounted UI consumes it from the event, a UI that
// mounts later (a brand-new record navigates from /new to /{id} first) consumes it on
// mount. Module memory, not sessionStorage, on purpose: a reload must never re-open a
// prompt for a Confirm that happened before it.

const pendingPrompts = new Map();
const promptKey = (spec, recordId) => `${spec}:${recordId}`;

/**
 * A queued prompt is only honoured for this long. The hand-off normally completes within
 * the same click (or one /new → /{id} navigation); an entry nobody consumed — the user left
 * before the topbar mounted — must not pop the modal up minutes later when they come back
 * to that record.
 */
export const FOLLOW_UP_PROMPT_TTL_MS = 30_000;

function dropExpiredPrompts(now) {
  for (const [key, entry] of pendingPrompts) {
    if (now - entry.queuedAt > FOLLOW_UP_PROMPT_TTL_MS) pendingPrompts.delete(key);
  }
}

/** Queue a prompt for `record` and announce it. */
export function requestFollowUpPrompt(spec, record) {
  if (!spec || !record?.id) return;
  const now = Date.now();
  dropExpiredPrompts(now);
  pendingPrompts.set(promptKey(spec, record.id), { record, queuedAt: now });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(FOLLOW_UP_PROMPT_EVENT, {
      detail: { spec, recordId: record.id },
    }));
  }
}

/**
 * Take the queued prompt for spec + record id, if any. Returns the record snapshot the
 * prompt was queued with (the freshly processed record), or null. A prompt is consumed
 * exactly once, and one older than FOLLOW_UP_PROMPT_TTL_MS is discarded instead.
 *
 * @param {number} [now=Date.now()] injectable clock (tests)
 */
export function consumeFollowUpPrompt(spec, recordId, now = Date.now()) {
  const key = promptKey(spec, recordId);
  const entry = pendingPrompts.get(key);
  if (!entry) return null;
  pendingPrompts.delete(key);
  return now - entry.queuedAt > FOLLOW_UP_PROMPT_TTL_MS ? null : entry.record;
}

/**
 * Builds the `draftMode.afterProcess` hook (saveActions.jsx → runDraftModeConfirm) for a
 * spec: when the just-processed record still has a configured follow-up pending, queue the
 * prompt and keep the user on the record (`{ stay: true }`); otherwise return null so the
 * window keeps its normal post-Confirm navigation.
 *
 * @param {string} spec
 * @param {object} [options] the window's follow-up option map; keys it does not configure
 *   never keep the user on the record.
 */
export function createFollowUpAfterProcess(spec, options) {
  return (record) => {
    if (!record?.id || !hasPendingFollowUp(record, options)) return null;
    requestFollowUpPrompt(spec, record);
    return { stay: true };
  };
}
