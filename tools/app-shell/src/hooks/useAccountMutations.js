import { useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { jsonHeaders, writeHeaders, throwHttpError } from '@/hooks/financialAccountHttp.js';

/**
 * Write operations against the `financial-account` NEO spec.
 *
 * ETP-4239: the spec is a generic W (CRUD) spec — standard REST verbs against
 * the `account` header entity, validated/enriched server-side by the
 * `financialAccountHeaderHandler` pre-hook (country derived from the IBAN,
 * default matching algorithm, name uniqueness, archive guard):
 *   - createAccount(payload)     → POST   /sws/neo/financial-account/account
 *   - updateAccount(id, payload) → PUT    /sws/neo/financial-account/account/{id}
 *   - archiveAccount(id)         → DELETE /sws/neo/financial-account/account/{id}
 *                                  (the hook soft-archives: IsActive='N')
 *   - fetchDefaults()            → GET selectors/C_Currency_ID + GET defaults
 *
 * Callers keep the SPA-level payload `{ name, type, currencyId, iban, swiftCode }`;
 * this hook maps it to the DAL property names the W contract persists
 * (`currency`, `iBAN`). `useNeoResource` only handles GETs, so these mutations
 * use `fetch` directly with the same cookie-session auth. Errors throw with the
 * backend message and an attached `status` so callers can branch (e.g. 409
 * duplicate name → inline error).
 */

const BASE_PATH = '/sws/neo/financial-account';
const ENTITY_PATH = `${BASE_PATH}/account`;

/**
 * Map the SPA form payload to the DAL property names of FIN_Financial_Account.
 * Only keys present in the input are emitted, so a PUT that omits `swiftCode`
 * (the edit modal hides BIC) leaves the stored value untouched.
 */
function toDalBody(payload) {
  const body = {};
  if ('name' in payload) body.name = payload.name;
  if ('type' in payload) body.type = payload.type;
  if ('currencyId' in payload) body.currency = payload.currencyId;
  if ('iban' in payload) body.iBAN = payload.iban;
  if ('swiftCode' in payload) body.swiftCode = payload.swiftCode;
  // Optional Salt Edge provider chosen at offline creation — the backend upserts it and links it
  // to the account so a later bank connect can preselect that bank.
  if (payload.providerCode) body.providerCode = payload.providerCode;
  if (payload.providerName) body.providerName = payload.providerName;
  // Reconciliation tolerance fields (only sent when explicitly changed in the edit modal).
  if ('dateTolerance' in payload) body.eMETGODateTolerance = payload.dateTolerance;
  if ('amountTolerance' in payload) body.eMETGOAmountTolerance = payload.amountTolerance;
  return body;
}

/** First record of a generic W CRUD envelope ({ response: { data: [row] } }). */
function firstRecord(json) {
  const data = json?.response?.data;
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function parseSelectorItems(json) {
  return json?.items || json?.response?.data || (Array.isArray(json) ? json : []);
}

export function useAccountMutations() {
  const { csrfToken } = useAuth();

  const createAccount = useCallback(async (payload) => {
    const res = await fetch(`${getApiBase()}${ENTITY_PATH}`, {
      method: 'POST',
      headers: writeHeaders(csrfToken),
      credentials: 'include',
      body: JSON.stringify(toDalBody(payload)),
    });
    if (!res.ok) await throwHttpError(res);
    const json = await res.json();
    return firstRecord(json);
  }, [csrfToken]);

  const updateAccount = useCallback(async (accountId, payload) => {
    const url = `${getApiBase()}${ENTITY_PATH}/${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: writeHeaders(csrfToken),
      credentials: 'include',
      body: JSON.stringify(toDalBody(payload)),
    });
    if (!res.ok) await throwHttpError(res);
    const json = await res.json();
    return firstRecord(json);
  }, [csrfToken]);

  const archiveAccount = useCallback(async (accountId) => {
    const url = `${getApiBase()}${ENTITY_PATH}/${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: writeHeaders(csrfToken),
      credentials: 'include',
    });
    if (!res.ok) await throwHttpError(res);
    return true;
  }, [csrfToken]);

  /**
   * Currency list + session default for the New/Edit account forms, served by
   * the generic W endpoints (selector options + entity defaults). Keeps the
   * legacy return shape `{ currencies: [{ id, iso, symbol }], defaultCurrencyId }`
   * so the form components stay unchanged. The default is best-effort.
   */
  const fetchDefaults = useCallback(async () => {
    // Both requests below are GETs, so they carry no CSRF proof.
    const headers = jsonHeaders();
    const selectorsUrl = `${getApiBase()}${ENTITY_PATH}/selectors/C_Currency_ID?limit=200`;
    const defaultsUrl = `${getApiBase()}${ENTITY_PATH}/defaults`;

    const res = await fetch(selectorsUrl, { headers, credentials: 'include' });
    if (!res.ok) await throwHttpError(res);
    const selectorJson = await res.json();
    const currencies = parseSelectorItems(selectorJson).map((row) => ({
      id: row.id,
      // C_Currency's AD identifier is its ISO code, so the selector display
      // value IS the ISO (e.g. "EUR"); fall back across row shapes.
      iso: row.name ?? row._identifier ?? row.label ?? '',
      symbol: row.symbol ?? '',
    }));

    let defaultCurrencyId = '';
    try {
      const defRes = await fetch(defaultsUrl, { headers, credentials: 'include' });
      if (defRes.ok) {
        const defJson = await defRes.json();
        defaultCurrencyId = defJson?.defaults?.currency || '';
      }
    } catch {
      // Defaults are best-effort; the form simply starts without a preselection.
    }

    return { currencies, defaultCurrencyId };
  }, [csrfToken]);

  return { createAccount, updateAccount, archiveAccount, fetchDefaults };
}
