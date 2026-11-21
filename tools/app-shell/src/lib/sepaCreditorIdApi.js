// A saved collection owns its file identifier (a copy taken from the bank account when it is created, and
// the one the SEPA file uses). The bank account supplies the default for new collections.
// The account editor uses the "new" segment and explicitly sets saveToAccount.

import { extractBackendMessageKeys, extractBackendMessageParams, translateBackendError } from '@/lib/backendErrors.js';

/** Record segment sent when there is no saved remittance. */
export const NEW_RECORD_SEGMENT = 'new';

/** Action base for a `useApiFetch(<remittance spec base>)`, i.e. the remittance window's own fetch. */
export const ACTION_BASE_IN_SPEC = '/remittance';
/** Action base for a `useApiFetch(getApiBase())` (absolute NEO paths), e.g. the account modal. */
export const ACTION_BASE_ABSOLUTE = '/sws/neo/remittance/remittance';

export const CREDITOR_SOURCE = Object.freeze({ remittance: 'remittance', account: 'account', suggested: 'suggested', missing: 'missing' });

const text = (value) => (value == null || value === '' ? null : String(value));
const flag = (value) => (typeof value === 'boolean' ? value : null);

function unwrap(json) {
  return json?.response?.data ?? json?.data ?? json ?? {};
}

/**
 * The creditor-id part of a `sepaFileData` / `saveCreditorId` answer, every key defaulted. The legacy
 * aliases `storedCreditorId` / `storedCreditorIdValid` (the account's value) are no longer read:
 * `accountCreditorId` is the account's own and `remittanceCreditorId` the collection's copy (null when
 * there is none, it is invalid, or it belongs to another account).
 */
export function normalizeCreditorIdInfo(raw) {
  const data = raw ?? {};
  const remittance = text(data.remittanceCreditorId);
  const account = text(data.accountCreditorId);
  const suggested = text(data.suggestedCreditorId);
  let source = Object.values(CREDITOR_SOURCE).includes(data.creditorIdSource) ? data.creditorIdSource : null;
  if (!source) {
    if (remittance) source = CREDITOR_SOURCE.remittance;
    else if (account) source = CREDITOR_SOURCE.account;
    else source = suggested ? CREDITOR_SOURCE.suggested : CREDITOR_SOURCE.missing;
  }
  const creditorId = text(data.creditorId) ?? remittance ?? account ?? suggested;
  return {
    remittanceCreditorId: remittance,
    remittanceCreditorIdValid: flag(data.remittanceCreditorIdValid),
    accountCreditorId: account,
    accountCreditorIdValid: flag(data.accountCreditorIdValid),
    suggestedCreditorId: suggested,
    creditorIdSource: source,
    creditorId,
    creditorIdAvailable: data.creditorIdAvailable === true && Boolean(creditorId),
  };
}

async function httpError(res, label) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return Object.assign(new Error(body?.error?.message || body?.message || `${label} ${res.status}`), { status: res.status, body });
}

const actionPath = (actionBase, recordId, action) =>
  `${actionBase}/${encodeURIComponent(recordId || NEW_RECORD_SEGMENT)}/action/${action}`;

/**
 * Reads the creditor-id state of an account and, on a saved remittance, of its copy (the record id counts as
 * the remittance id). @throws {Error} with `status` and `body` on a refusal. */
export async function fetchCreditorIdInfo(apiFetch, actionBase, { recordId, accountId, organizationId = null }) {
  const res = await apiFetch(actionPath(actionBase, recordId, 'sepaFileData'), {
    method: 'POST',
    body: JSON.stringify(organizationId ? { accountId, organizationId } : { accountId }),
  });
  if (!res.ok) throw await httpError(res, 'sepaFileData');
  return normalizeCreditorIdInfo(unwrap(await res.json()));
}

/**
 * Stores the identifier. On a saved remittance (`recordId`) it goes ONLY to that remittance; the account changes
 * only with `saveToAccount` (its default for new collections). On the record `new` the server requires
 * `saveToAccount` (the account editor). The server normalizes and validates it.
 * @returns {Promise<ReturnType<typeof normalizeCreditorIdInfo>>} the updated identifier state
 * @throws {Error} with `status` and `body` (messageKeys, expectedCheckDigits) on a refusal
 */
export async function saveCreditorId(apiFetch, actionBase, { recordId, accountId, creditorId, organizationId = null, saveToAccount = false }) {
  const body = organizationId ? { accountId, creditorId, organizationId } : { accountId, creditorId };
  if (saveToAccount) body.saveToAccount = true;
  const res = await apiFetch(actionPath(actionBase, recordId, 'saveCreditorId'), { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw await httpError(res, 'saveCreditorId');
  return normalizeCreditorIdInfo(unwrap(await res.json()));
}

/**
 * A translated message for a refused save: `messageKeys` first (the check-digits refusal adds the
 * digits the server expects), its text second, then the fallback key.
 */
export function creditorIdSaveErrorMessage(err, ui, fallbackKey = 'sepaCreditorIdSaveError') {
  const body = err?.body ?? null;
  const keys = extractBackendMessageKeys(body);
  const expected = body?.error?.expectedCheckDigits ?? body?.expectedCheckDigits;
  if (expected && keys?.includes('ETGO_SepaCreditorIdInvalidCheckDigits')) {
    return ui('sepaCreditorIdInvalidCheckDigitsExpected', { digits: String(expected) });
  }
  const translated = translateBackendError(body?.error?.message ?? body?.message ?? err?.message ?? '', ui, {
    code: body?.error?.code ?? body?.code,
    messageKeys: keys,
    messageParams: extractBackendMessageParams(body),
  });
  return translated || ui(fallbackKey);
}

// A save done in one place (the block, «Antes de confirmar», the account modal) must refresh the
// others without them knowing each other: a window event carrying the account id.
const SAVED_EVENT = 'sepa-creditor-id-saved';

export function notifyCreditorIdSaved(accountId) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: { accountId } }));
}

/** Subscribes to {@link notifyCreditorIdSaved} for one account; returns the unsubscribe function. */
export function onCreditorIdSaved(accountId, callback) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => { if (!accountId || event.detail?.accountId === accountId) callback(event.detail); };
  window.addEventListener(SAVED_EVENT, handler);
  return () => window.removeEventListener(SAVED_EVENT, handler);
}
