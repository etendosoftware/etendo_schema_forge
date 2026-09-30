import { useCallback } from 'react';
import { useOptionalDataCache } from '@etendosoftware/app-shell-core/data';

/**
 * Entity name of the Cuentas list query. Must match `<ListView entity="account">` in the generated
 * AccountPage, which `useEntity` puts into the list's query key.
 */
export const ACCOUNT_LIST_ENTITY = 'account';

/**
 * ETP-5522: marks the Cuentas (financial-account) list stale after a mutation in the account
 * detail.
 *
 * The list badge reads the stored computed column EM_ETGO_Pending_Count, which the database keeps
 * exact. The list itself, however, is served from the shared query cache (recordStaleTime 30s):
 * the detail mutates through its own hooks (statements, movements, reconciliations, automatch,
 * cash close, bank connection) that bypass that cache, so returning to the list showed the
 * pre-mutation badge until a manual refresh.
 *
 * `invalidate` only marks the matching entries stale — it issues no request — so calling it on
 * every mutation success is cheap, and the list refetches on its next mount only when something
 * actually changed. `{ entity }` alone is a partial match: every cached list/record query for the
 * entity is invalidated regardless of scope/spec/filters (safe over-invalidation).
 *
 * No-op when no DataProvider is mounted. Do NOT call it on plain navigation or mount.
 *
 * @returns {{ invalidateAccountList: () => void }}
 */
export function useFinancialAccountCacheInvalidation() {
  const cache = useOptionalDataCache()?.cache;

  const invalidateAccountList = useCallback(() => {
    cache?.invalidate({ entity: ACCOUNT_LIST_ENTITY });
  }, [cache]);

  return { invalidateAccountList };
}
