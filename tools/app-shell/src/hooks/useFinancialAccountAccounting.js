import { useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { authHeaders, throwHttpError } from '@/hooks/financialAccountHttp.js';

/**
 * Read/write operations against the `accountingConfiguration` entity of the
 * `financial-account` NEO spec (ETP-4530 — Tab Contabilidad of the account edit form).
 *
 * The entity is fully intercepted by `FinancialAccountAccountingHandler`
 * (`@Named("financialAccountAccountingHandler")`) — no plain generic CRUD — so both GET and
 * save always resolve/find-or-create the single per-ledger row for the account transparently.
 * Only two fields are exposed for write: `fINAssetAcct` ("Cuenta bancaria", required) and
 * `fINTransitoryAcct` ("Cuenta transitoria", optional). The GET response also carries
 * `catalogs.accounts` — the active accounting-combination options for the account's ledger, used
 * to populate the two search selects client-side (no separate selector round-trip).
 *
 *   - fetchAccountingConfiguration(accountId) → GET  /sws/neo/financial-account/accountingConfiguration
 *   - saveAccountingConfiguration(accountId, { fINAssetAcct, fINTransitoryAcct })
 *                                             → POST /sws/neo/financial-account/accountingConfiguration
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
  const { token } = useAuth();

  const fetchAccountingConfiguration = useCallback(async (accountId) => {
    const url = `${getApiBase()}${ENTITY_PATH}?financialAccountId=${encodeURIComponent(accountId)}`;
    const res = await fetch(url, { headers: authHeaders(token) });
    if (!res.ok) await throwHttpError(res);
    const json = await res.json();
    return firstRecord(json);
  }, [token]);

  const saveAccountingConfiguration = useCallback(async (accountId, { fINAssetAcct, fINTransitoryAcct }) => {
    const res = await fetch(`${getApiBase()}${ENTITY_PATH}`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        financialAccountId: accountId,
        fINAssetAcct: fINAssetAcct || null,
        fINTransitoryAcct: fINTransitoryAcct || null,
      }),
    });
    if (!res.ok) await throwHttpError(res);
    const json = await res.json();
    return firstRecord(json);
  }, [token]);

  return { fetchAccountingConfiguration, saveAccountingConfiguration };
}
