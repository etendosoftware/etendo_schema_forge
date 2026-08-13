import { useMemo } from 'react';
import { useNeoResource } from './useNeoResource';

const EMPTY_TOTALS = { balance: 0, inflows: 0, outflows: 0, currency: 'EUR' };

function normalizeTotals(raw) {
  if (!raw) return EMPTY_TOTALS;
  return {
    balance: Number(raw.balance ?? 0),
    inflows: Number(raw.inflows ?? 0),
    outflows: Number(raw.outflows ?? 0),
    currency: raw.currency ?? 'EUR',
  };
}

/**
 * Fetches movements and KPI totals for a single financial account.
 *
 * Powered by FinancialAccountTransactionsHandler (ETP-4098) at:
 *   GET /sws/neo/financial-account-transactions?FIN_Financial_Account_ID={id}
 *
 * @param {string} accountId
 * @param {object} [_filters] - reserved for future server-side filtering
 * @returns {{
 *   movements: Array<object>,
 *   totals: { balance: number, inflows: number, outflows: number, currency: string },
 *   loading: boolean,
 *   error: Error|null,
 *   reload: () => void
 * }}
 */
export function useAccountMovements(accountId, _filters) {
  const path = accountId
    ? `/sws/neo/financial-account-transactions?FIN_Financial_Account_ID=${encodeURIComponent(accountId)}`
    : null;

  const mapPayload = useMemo(
    () => (raw) => ({
      movements: Array.isArray(raw.transactions) ? raw.transactions : [],
      totals: normalizeTotals(raw.totals),
      enabledDimensions: Array.isArray(raw.enabledDimensions) ? raw.enabledDimensions : [],
      headerDimensions: Array.isArray(raw.headerDimensions) ? raw.headerDimensions : [],
      trxTypes: Array.isArray(raw.trxTypes) ? raw.trxTypes : [],
      accountOrgId: raw.accountOrgId || null,
      paymentMethods: Array.isArray(raw.paymentMethods) ? raw.paymentMethods : [],
    }),
    [],
  );

  const { data, loading, error, reload } = useNeoResource({
    path,
    deps: [accountId],
    mapPayload,
    label: 'useAccountMovements',
  });

  return {
    movements: data?.movements ?? [],
    totals: data?.totals ?? EMPTY_TOTALS,
    enabledDimensions: data?.enabledDimensions ?? [],
    headerDimensions: data?.headerDimensions ?? [],
    trxTypes: data?.trxTypes ?? [],
    accountOrgId: data?.accountOrgId ?? null,
    paymentMethods: data?.paymentMethods ?? [],
    loading,
    error,
    reload,
  };
}
