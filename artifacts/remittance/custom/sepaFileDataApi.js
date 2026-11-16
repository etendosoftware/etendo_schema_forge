// ETP-6148 — «Datos para el fichero SEPA» on the remittance header: the read action and the IBAN
// save behind RemittanceSepaFileData. CONTRACT confirmed by the backend (RemittanceHeaderHandler,
// developer-go-3); kept in this one module so adjusting it touches nothing else. Pure functions
// over injected `apiFetch` helpers (docs/request-policy.md).
//
//   READ  POST <spec>/remittance/{id|new}/action/sepaFileData  { accountId, organizationId? }
//         NEO actions need a record segment; an unsaved remittance has no id, so the SPA sends the
//         sentinel `new` (NEW_RECORD_SEGMENT), which the backend never loads. The organization is
//         `organizationId` if sent, else the saved remittance's, else the account's.
//     → { accountId, accountName, iban, ibanValid, organizationId, country (the ORGANIZATION's ISO,
//         the one inside the creditor id), creditorId, creditorIdAvailable,
//         missing: ["iban" | "orgTaxId" | "country" | "creditorBusinessCode"] (in that order;
//         creditorBusinessCode when the CORE type's Creditor_Business_Code is not 3 letters/digits) }
//     Refusals: 404 plain text (account / organization not found), 422 ETGO_RemittanceAccountNotBank
//     / ETGO_RemittanceAccountNotAllowed, 403 feature_disabled.
//   SAVE  the existing financial-account update: PATCH /sws/neo/financial-account/account/{id}
//         { iBAN, updated }. `updated` is mandatory on every NEO update (optimistic lock,
//         NeoCrudHandler#validateUpdateRequest), so the account is read first for its token.
//         The body carries only the IBAN: the account must already have a country, set in
//         Edit account. Without one the backend refuses with 400 ETGO_FinAccIbanRequiresCountry,
//         which the block shows as «set the country in Edit account» (remittanceSepaIbanNeedsAccountCountry);
//         the other refusals (the IBAN/country pair texts) are translated through backendErrors.js.

import { throwHttpError } from '@/hooks/financialAccountHttp.js';

/** Record segment sent for an unsaved remittance. */
export const NEW_RECORD_SEGMENT = 'new';

const ACCOUNT_PATH = '/sws/neo/financial-account/account';

/** The action's payload, whether or not NEO wrapped it in `response.data`. */
function unwrap(json) {
  return json?.response?.data ?? json?.data ?? json ?? {};
}

async function readJsonSafely(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function httpError(res, label) {
  const body = await readJsonSafely(res);
  return Object.assign(new Error(body?.error?.message || body?.message || `${label} ${res.status}`), {
    status: res.status,
    body,
  });
}

/** The read model the block renders, with every key defaulted. */
export function normalizeSepaFileData(raw) {
  const data = raw ?? {};
  return {
    accountId: data.accountId ?? null,
    accountName: data.accountName ?? '',
    organizationId: data.organizationId ?? null,
    iban: data.iban || null,
    ibanValid: data.ibanValid === true,
    country: data.country ?? null,
    creditorId: data.creditorId || null,
    creditorIdAvailable: data.creditorIdAvailable === true && Boolean(data.creditorId),
    missing: Array.isArray(data.missing) ? data.missing : [],
  };
}

/**
 * The SEPA file data of the chosen account, for a saved or a new remittance.
 *
 * @param {Function} apiFetch - `useApiFetch(apiBaseUrl)` of the remittance spec
 * @param {string|null} remittanceId - the record id, or null/undefined for an unsaved remittance
 * @param {string} accountId - FIN_Financial_Account_ID
 * @param {string|null} [organizationId] - the header's organization, sent only when known
 * @returns {Promise<ReturnType<typeof normalizeSepaFileData>>}
 * @throws {Error} with `status` and `body` when the backend refuses
 */
export async function fetchSepaFileData(apiFetch, remittanceId, accountId, organizationId = null) {
  const segment = encodeURIComponent(remittanceId || NEW_RECORD_SEGMENT);
  const res = await apiFetch(`/remittance/${segment}/action/sepaFileData`, {
    method: 'POST',
    body: JSON.stringify(organizationId ? { accountId, organizationId } : { accountId }),
  });
  if (!res.ok) throw await httpError(res, 'sepaFileData');
  return normalizeSepaFileData(unwrap(await res.json()));
}

/**
 * Stores `iban` on the financial account (not on the remittance).
 *
 * @param {Function} accountsApiFetch - `useApiFetch(getApiBase())` (absolute NEO paths)
 * @param {string} accountId
 * @param {string} iban - already normalized (no spaces, upper case)
 * @throws {Error} with `status`, `code` and `body` when the backend refuses (throwHttpError)
 */
export async function saveAccountIban(accountsApiFetch, accountId, iban) {
  const url = `${ACCOUNT_PATH}/${encodeURIComponent(accountId)}`;
  const read = await accountsApiFetch(url);
  if (!read.ok) throw await httpError(read, 'account');
  const json = await read.json();
  const record = Array.isArray(json?.response?.data) ? json.response.data[0] : (json?.response?.data ?? json);
  const res = await accountsApiFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ iBAN: iban, updated: record?.updated }),
  });
  // Same error shape as the Edit-account form's saves (message, status, code, body), so the caller
  // translates it the same way.
  if (!res.ok) await throwHttpError(res);
}
