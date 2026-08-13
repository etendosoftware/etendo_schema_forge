import { useMemo } from 'react';
import { useNeoResource } from './useNeoResource';

/**
 * Fetches the list of imported bank statements for a financial account.
 *
 * GET /sws/neo/bank-statements?FIN_Financial_Account_ID={accountId}
 *
 * @param {string} accountId
 * @returns {{ statements: Array<object>, loading: boolean, error: Error|null, reload: () => void }}
 */
export function useBankStatements(accountId) {
  const path = accountId
    ? `/sws/neo/bank-statements?FIN_Financial_Account_ID=${encodeURIComponent(accountId)}`
    : null;

  const mapPayload = useMemo(
    () => (raw) => ({ statements: Array.isArray(raw.statements) ? raw.statements : [] }),
    [],
  );

  const { data, loading, error, reload } = useNeoResource({
    path,
    deps: [accountId],
    mapPayload,
    label: 'useBankStatements',
  });

  return { statements: data?.statements ?? [], loading, error, reload };
}
