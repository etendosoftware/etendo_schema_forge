import { useCallback } from 'react';
import { useOptionalDataCache } from '@etendosoftware/app-shell-core/data';

/**
 * ETP-4564: Contacts-specific cache invalidation for the raw-fetch mutation paths
 * that bypass the generic useEntity save/delete (credit limit, discounts, inline
 * table edit/delete, bulk delete). Keeps the shared cache consistent after those
 * writes. No-op when no DataProvider is mounted.
 *
 * Patterns are partial matches (see matchesQueryKey): `{ entity }` alone marks
 * every cached list/record/KPI query for that entity stale regardless of
 * scope/spec/recordId — safe over-invalidation that forces a fresh read.
 */
export function useContactsCacheInvalidation() {
  const cache = useOptionalDataCache()?.cache;

  const invalidateBusinessPartner = useCallback(() => {
    cache?.invalidate({ entity: 'businessPartner' });
  }, [cache]);

  const invalidateFinanceKpis = useCallback(() => {
    cache?.invalidate({ entity: 'bp-stats' });
    cache?.invalidate({ entity: 'bp-trend' });
  }, [cache]);

  return { invalidateBusinessPartner, invalidateFinanceKpis };
}
