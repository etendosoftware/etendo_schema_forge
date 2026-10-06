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
 * return or a fully delivered invoice simply comes back with an empty `available`. When the
 * backend needs a value it cannot decide on its own (e.g. the target warehouse), the POST
 * fails with an `input` block and is retried with the chosen value (readFollowUpInputRequest).
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
  // Only shown when the 409 arrives WITHOUT an `input` block (an older backend, or one that
  // found no candidate); with the block the modal asks for the value instead of failing.
  FOLLOW_UP_WAREHOUSE_REQUIRED: 'followUpErrorWarehouseRequired',
  FOLLOW_UP_INVALID_INPUT: 'followUpErrorInvalidInput',
};
export const FOLLOW_UP_GENERIC_ERROR_KEY = 'followUpErrorGeneric';

/** The error of a NEO error body (`{error:{…}}`, or the older `{response:{error}}`). */
function readFollowUpError(body) {
  return body?.error ?? body?.response?.error ?? null;
}

/** The error code of a NEO error body (`{error:{code}}`, or the older `{response:{error}}`). */
export function readFollowUpErrorCode(body) {
  return readFollowUpError(body)?.code ?? null;
}

// ── Input-required round-trip ──────────────────────────────────────────────────
//
// When the backend cannot decide a value the follow-up document needs (today: the target
// warehouse), it answers the action POST with an error that carries an `input` block:
//
//   { error: { code: 'FOLLOW_UP_WAREHOUSE_REQUIRED', status: 409, message: '…',
//              input: { key: 'warehouseId', options: [{ id: '…', name: '…' }] } } }
//
// and accepts the same POST again with `{ [input.key]: <chosen id> }` in the body. Nothing
// here knows which key it is: the key and the options come from the backend, only the
// label is looked up in i18n (see followUpInputLabels).

// A plain identifier: it becomes a JSON body key and part of an i18n key, so anything else
// (empty, `__proto__`-like oddities, dots, spaces) is treated as "no usable input block".
// A name inherited from Object.prototype (`constructor`, `toString`, …) is rejected too:
// reading it from a plain values object would yield a truthy function, not a chosen value.
const isUsableInputKey = (key) => typeof key === 'string' && INPUT_KEY_PATTERN.test(key) && !(key in Object.prototype);

/** The value chosen for `key`, read as an OWN property only ('' when none). */
export function readFollowUpInputValue(values, key) {
  return values && key && Object.hasOwn(values, key) ? values[key] : '';
}
const INPUT_KEY_PATTERN = /^[A-Za-z]\w*$/;

/**
 * The value the backend asks for, from a failed action body, or null when the body carries
 * no usable `input` block (no key, an unsafe key, or no option with an id).
 *
 * @returns {{key: string, options: Array<{id: string, name: string}>}|null}
 */
export function readFollowUpInputRequest(body) {
  const input = readFollowUpError(body)?.input;
  if (!input || !isUsableInputKey(input.key)) return null;
  const options = (Array.isArray(input.options) ? input.options : [])
    .filter((opt) => opt && opt.id != null && opt.id !== '')
    .map((opt) => ({ id: String(opt.id), name: opt.name ? String(opt.name) : String(opt.id) }));
  return options.length > 0 ? { key: input.key, options } : null;
}

/** Generic selector label, used when no `followUpInput<Key>` translation exists. */
export const FOLLOW_UP_INPUT_GENERIC_LABEL_KEY = 'followUpInputGeneric';

/**
 * i18n keys of an input requested by the backend: `followUpInput<Key>` (label) and
 * `followUpInput<Key>Help` (helper text), e.g. `warehouseId` → `followUpInputWarehouseId`.
 */
export function followUpInputLabelKeys(inputKey) {
  const suffix = `${inputKey.charAt(0).toUpperCase()}${inputKey.slice(1)}`;
  return { labelKey: `followUpInput${suffix}`, helpKey: `followUpInput${suffix}Help` };
}

/**
 * Translated label and helper text for an input key. `ui` returns the key itself when it
 * has no translation: the label then falls back to the generic «Selecciona una opción» and
 * the helper text is omitted (null) rather than showing a raw key.
 */
export function followUpInputLabels(inputKey, ui) {
  const { labelKey, helpKey } = followUpInputLabelKeys(inputKey);
  const label = ui?.(labelKey);
  const help = ui?.(helpKey);
  return {
    label: label && label !== labelKey ? label : (ui?.(FOLLOW_UP_INPUT_GENERIC_LABEL_KEY) || FOLLOW_UP_INPUT_GENERIC_LABEL_KEY),
    help: help && help !== helpKey ? help : null,
  };
}

/**
 * The selector state after the backend asked for `request`: the values already collected
 * for the same action are kept (a later request may ask for a second key), and the value of
 * the requested key is kept only if it is still one of the offered options — otherwise it
 * is preselected when exactly one option came back, and left empty when several did.
 *
 * @param {{key: string, options: Array<{id: string}>}} request
 * @param {Object<string, string>} [previousValues]
 * @returns {Object<string, string>}
 */
export function mergeFollowUpInputValues(request, previousValues = {}) {
  const values = { ...previousValues };
  const previous = readFollowUpInputValue(values, request.key);
  if (!request.options.some((opt) => opt.id === previous)) {
    if (request.options.length === 1) values[request.key] = request.options[0].id;
    else delete values[request.key];
  }
  return values;
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
