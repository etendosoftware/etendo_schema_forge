// ETP-6148 — «Datos para el fichero SEPA» on the remittance header: the read action behind
// RemittanceSepaFileData. CONTRACT confirmed by the backend (RemittanceHeaderHandler,
// developer-go-3); kept in this one module so adjusting it touches nothing else. Pure functions
// over injected `apiFetch` helpers (docs/request-policy.md).
//
//   READ  POST <spec>/remittance/{id|new}/action/sepaFileData  { accountId, organizationId? }
//         (a saved remittance's record id counts as its id: no `remittanceId` is sent)
//         NEO actions need a record segment; an unsaved remittance has no id, so the SPA sends the
//         sentinel `new` (NEW_RECORD_SEGMENT), which the backend never loads. The organization is
//         `organizationId` if sent, else the saved remittance's, else the account's.
//     → { accountId, accountName, iban, ibanValid (effective), remittanceIban, accountIban, ibanSource, organizationId, country (the ORGANIZATION's ISO, the
//         one inside the creditor id), collection (true / false with a remittance, null without),
//         remittanceCreditorId (the collection's copy; null when none, invalid or of another account),
//         remittanceCreditorIdValid, accountCreditorId, accountCreditorIdValid, suggestedCreditorId,
//         creditorIdSource ('remittance' | 'account' | 'suggested' | 'missing'), creditorId (effective),
//         creditorIdAvailable, directDebitScheme ('CORE' | 'B2B', null on a payment remittance), financed,
//         missing: ["iban" | "orgTaxId" | "country" | "creditorBusinessCode"] (in that order;
//         creditorBusinessCode when the CORE type's Creditor_Business_Code is not 3 letters/digits) }
//     Refusals: 404 plain text (account / organization not found), 422 ETGO_RemittanceAccountNotBank
//     / ETGO_RemittanceAccountNotAllowed, 403 feature_disabled.
//   IBAN  the remittance's OWN IBAN (REM_REMITTANCE.IBAN, property `iBAN`) is written by the header's CRUD
//         (create body or update) with the rest of the header, never to the account: the block hands
//         it to the form (`onChange('iBAN', value)`) and the header's «Guardar» sends it. The server
//         normalizes and validates it (422 ETGO_RemittanceIbanInvalid); a blank value is ignored (the
//         server proposes the account's on create and when the account changes or the type switches
//         collection <-> payment; the trigger only freezes it once processed). The read model
//         carries `remittanceIban`, `accountIban`, their `*Valid` flags and `ibanSource`
//         ('remittance' | 'account' | 'missing'); `iban` / `ibanValid` are the effective ones.

import { normalizeCreditorIdInfo } from '@/lib/sepaCreditorIdApi.js';

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
    remittanceIban: data.remittanceIban || null,
    remittanceIbanValid: typeof data.remittanceIbanValid === 'boolean' ? data.remittanceIbanValid : null,
    accountIban: data.accountIban || null,
    accountIbanValid: typeof data.accountIbanValid === 'boolean' ? data.accountIbanValid : null,
    ibanSource: ['remittance', 'account', 'missing'].includes(data.ibanSource)
      ? data.ibanSource
      : (data.remittanceIban ? 'remittance' : (data.accountIban || data.iban ? 'account' : 'missing')),
    country: data.country ?? null,
    ...normalizeCreditorIdInfo(data),
    directDebitScheme: data.directDebitScheme === 'CORE' || data.directDebitScheme === 'B2B' ? data.directDebitScheme : null,
    financed: data.financed === true,
    collection: typeof data.collection === 'boolean' ? data.collection : null,
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
 * Whether a remittance type is a collection or a payment, from the type selector's item (`direction`), which is
 * known before the remittance is saved. `null` when the backend does not send it (an older one), the type is not
 * among the account's, or the request fails: the caller then falls back to `sepaFileData.collection`.
 *
 * @param {Function} apiFetch - `useApiFetch(apiBaseUrl)` of the remittance spec
 * @returns {Promise<'collection'|'payment'|null>}
 */
export async function fetchRemittanceTypeDirection(apiFetch, accountId, typeId) {
  try {
    const res = await apiFetch(`/remittance/selectors/remittanceType?FIN_Financial_Account_ID=${encodeURIComponent(accountId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const payload = unwrap(json);
    const items = Array.isArray(payload) ? payload : (payload.items ?? json?.items ?? []);
    const direction = items.find((item) => item?.id === typeId)?.direction;
    return direction === 'collection' || direction === 'payment' ? direction : null;
  } catch {
    return null;
  }
}

/**
 * The bank logo of a financial account (`providerLogoUrl`, the connected bank's own, persisted from the
 * PSD2 provider catalog) and its type, for AccountLogoAvatar. Best effort: any failure is null, the
 * avatar then shows its generic bank icon.
 *
 * @param {Function} accountsApiFetch - `useApiFetch(getApiBase())` (absolute NEO paths)
 * @returns {Promise<{ providerLogoUrl: string|null, type: string|null }|null>}
 */
export async function fetchAccountLogo(accountsApiFetch, accountId) {
  try {
    const res = await accountsApiFetch(`${ACCOUNT_PATH}/${encodeURIComponent(accountId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const record = Array.isArray(json?.response?.data) ? json.response.data[0] : (json?.response?.data ?? json);
    return { providerLogoUrl: record?.providerLogoUrl || null, type: record?.type || null };
  } catch {
    return null;
  }
}
