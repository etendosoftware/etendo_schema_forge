import { useCallback } from 'react';
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
 *   - archiveAccount(id)         → PATCH  /sws/neo/financial-account/account/{id} {active:false}
 *   - unarchiveAccount(id)       → PATCH  /sws/neo/financial-account/account/{id} {active:true}
 *   - deleteAccount(id)          → DELETE /sws/neo/financial-account/account/{id}
 *                                  (ETP-4871: a REAL delete, gated server-side by `deletable` —
 *                                  every account row now carries `deletable`/
 *                                  `deleteBlockedReason`; the backend still answers 409 in case a
 *                                  dependency appeared after the row was loaded, a defense against
 *                                  the list-load/click race)
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
  // DAL property names per contract.json: the custom columns are `EM_ETGO_Date_Tolerance` /
  // `EM_ETGO_Amount_Tolerance`, but Etendo derives the bean property by dropping the "EM_"
  // module prefix — `eTGODateTolerance` / `eTGOAmountTolerance`, NOT `eMETGO...`. The W CRUD
  // spec silently ignores unrecognized body keys (no 400), so the stray "eM" prefix used to
  // PUT successfully while quietly dropping both tolerances — ETP-4764 follow-up.
  if ('dateTolerance' in payload) body.eTGODateTolerance = payload.dateTolerance;
  if ('amountTolerance' in payload) body.eTGOAmountTolerance = payload.amountTolerance;
  // Write-off limit (ETP-4797). A physical AD column, so no EM_ prefix. An empty box is sent as
  // null, not 0: null means "no limit", while 0 would forbid every write-off.
  if ('writeoffLimit' in payload) {
    const raw = payload.writeoffLimit;
    body.writeofflimit = (raw === '' || raw == null) ? null : Number(raw);
  }
  if ('glItemDifferenceId' in payload) body.aprmGlitemDiff = payload.glItemDifferenceId || null;
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

  const createAccount = useCallback(async (payload) => {
    const res = await fetch(`${getApiBase()}${ENTITY_PATH}`, {
      method: 'POST',
      headers: writeHeaders(),
      credentials: 'include',
      body: JSON.stringify(toDalBody(payload)),
    });
    if (!res.ok) await throwHttpError(res);
    const json = await res.json();
    return firstRecord(json);
  }, []);

  const updateAccount = useCallback(async (accountId, payload) => {
    const url = `${getApiBase()}${ENTITY_PATH}/${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: writeHeaders(),
      credentials: 'include',
      body: JSON.stringify(toDalBody(payload)),
    });
    if (!res.ok) await throwHttpError(res);
    const json = await res.json();
    return firstRecord(json);
  }, []);

  /**
   * Soft-archives an account (`IsActive` to 'N'). ETP-4871: this used to be the DELETE verb
   * (the backend short-circuited every delete into an archive), which meant a real delete could
   * never be offered — "Eliminar" only ever archived. Archiving is now its own PATCH, the exact
   * mirror of {@link unarchiveAccount} below, and DELETE is reserved for {@link deleteAccount}.
   */
  const archiveAccount = useCallback(async (accountId) => {
    const url = `${getApiBase()}${ENTITY_PATH}/${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: writeHeaders(),
      credentials: 'include',
      body: JSON.stringify({ active: false }),
    });
    if (!res.ok) await throwHttpError(res);
    return true;
  }, []);

  /**
   * Permanently deletes an account (ETP-4871). Only ever reachable from the UI when the row's
   * `deletable` flag is true — every FK into `FIN_Financial_Account` is RESTRICT, so the backend
   * still re-validates and 409s (with a human-readable `message`) if a dependent record appeared
   * between the list load and this call.
   */
  const deleteAccount = useCallback(async (accountId) => {
    const url = `${getApiBase()}${ENTITY_PATH}/${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: writeHeaders(),
      credentials: 'include',
    });
    if (!res.ok) await throwHttpError(res);
    return true;
  }, []);

  /**
   * Restores an archived account (`IsActive` back to 'Y').
   *
   * A plain PATCH rather than a dedicated endpoint: `active` is a base AD column with no
   * ETGO_SF_FIELD row, and `NeoFieldFilter` deliberately hardcodes it as included AND writable
   * precisely so inline activate/deactivate works — the same route match-rule's "Activa" toggle
   * already uses. `FinancialAccountHandler.validateAndEnrichUpdate` only validates the keys the
   * body actually carries, so a body of just `{ active }` passes straight through to the generic
   * CRUD. No backend change was needed for this.
   */
  const unarchiveAccount = useCallback(async (accountId) => {
    const url = `${getApiBase()}${ENTITY_PATH}/${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: writeHeaders(),
      credentials: 'include',
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) await throwHttpError(res);
    return true;
  }, []);

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
  }, []);

  return {
    createAccount, updateAccount, archiveAccount, unarchiveAccount, deleteAccount, fetchDefaults,
  };
}
