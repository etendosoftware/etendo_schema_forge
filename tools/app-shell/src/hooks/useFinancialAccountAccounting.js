import { useCallback } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { throwHttpError } from '@/hooks/financialAccountHttp.js';

/**
 * Read/write operations against the `accountingConfiguration` entity of the
 * `financial-account` NEO spec (ETP-4530 — Tab Contabilidad of the account edit form).
 *
 * The entity is fully intercepted by `FinancialAccountAccountingHandler`
 * (`@Named("financialAccountAccountingHandler")`) — no plain generic CRUD — so both GET and
 * save always resolve/find-or-create the single per-ledger row for the account transparently.
 *
 * ETP-4872 — the old two-field set (`fINAssetAcct` / `fINTransitoryAcct`) is fully retired and
 * replaced by the account-type-dependent set of 9 fields below. No field is required — see
 * `docs/superpowers/plans/2026-08-30-etp-4872-financial-account-accounting-fields.md`. The GET
 * response also carries `catalogs.accounts` — the active accounting-combination options for the
 * account's ledger, used to populate the search selects client-side (no separate selector
 * round-trip).
 *
 *   - fetchAccountingConfiguration(accountId) → GET  /sws/neo/financial-account/accountingConfiguration
 *   - saveAccountingConfiguration(accountId, {
 *       fINBankrevaluationgainAcct, fINBankrevaluationlossAcct, fINBankfeeAcct,
 *       inTransitPaymentAccountIN, depositAccount, clearedPaymentAccount,
 *       fINOutIntransitAcct, withdrawalAccount, clearedPaymentAccountOUT,
 *     })                                     → POST /sws/neo/financial-account/accountingConfiguration
 */

const BASE_PATH = '/sws/neo/financial-account';
const ENTITY_PATH = `${BASE_PATH}/accountingConfiguration`;

/** First record of a generic single-row envelope ({ response: { data: [row] } }). */
function firstRecord(json) {
  const data = json?.response?.data;
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export function useFinancialAccountAccounting() {
  const apiFetch = useApiFetch(getApiBase());

  const fetchAccountingConfiguration = useCallback(async (accountId) => {
    const res = await apiFetch(`${ENTITY_PATH}?financialAccountId=${encodeURIComponent(accountId)}`);
    if (!res.ok) await throwHttpError(res);
    const json = await res.json();
    return firstRecord(json);
  }, [apiFetch]);

  const saveAccountingConfiguration = useCallback(async (accountId, fields) => {
    const res = await apiFetch(ENTITY_PATH, {
      method: 'POST',
      body: JSON.stringify({
        financialAccountId: accountId,
        fINBankrevaluationgainAcct: fields.fINBankrevaluationgainAcct || null,
        fINBankrevaluationlossAcct: fields.fINBankrevaluationlossAcct || null,
        fINBankfeeAcct: fields.fINBankfeeAcct || null,
        inTransitPaymentAccountIN: fields.inTransitPaymentAccountIN || null,
        depositAccount: fields.depositAccount || null,
        clearedPaymentAccount: fields.clearedPaymentAccount || null,
        fINOutIntransitAcct: fields.fINOutIntransitAcct || null,
        withdrawalAccount: fields.withdrawalAccount || null,
        clearedPaymentAccountOUT: fields.clearedPaymentAccountOUT || null,
      }),
    });
    if (!res.ok) await throwHttpError(res);
    const json = await res.json();
    return firstRecord(json);
  }, [apiFetch]);

  return { fetchAccountingConfiguration, saveAccountingConfiguration };
}
