import { useMemo } from 'react';
import { useNeoResource } from './useNeoResource';

const ENDPOINT = '/sws/neo/financial-accounts-page';

/**
 * Fetches the detail for a single financial account by id.
 *
 * T4 shortcut: uses list endpoint + client-side filter.
 * Follow-up: replace with dedicated /sws/neo/financial-account/{id} endpoint
 * once FIN_Financial_Account NEO spec is live.
 *
 * @param {string} accountId
 * @returns {{ account: object|null, loading: boolean, error: Error|null, reload: () => void }}
 */
export function useFinancialAccount(accountId) {
  const mapPayload = useMemo(
    () => (raw) => {
      const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
      return accounts.find((a) => String(a.id) === String(accountId)) ?? null;
    },
    [accountId],
  );

  const { data, loading, error, reload } = useNeoResource({
    path: ENDPOINT,
    deps: [accountId],
    mapPayload,
    timeoutMs: 10000,
    label: 'financial-account',
  });

  return { account: data, loading, error, reload };
}
