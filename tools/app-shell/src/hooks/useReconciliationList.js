import { useMemo } from 'react';
import { useNeoResource } from './useNeoResource';

/**
 * Read-only access to the reconciliation documents of a financial account and their cleared items
 * (ETP-4795) — what Classic shows in its "Reconciliations" tab and its "Cleared items" child tab.
 *
 * No custom NeoHandler is involved: both are plain W-spec entities of the `financial-account`
 * spec, served by the generic NEO CRUD. `push-to-neo` already creates an `ETGO_SF_ENTITY` row per
 * AD tab, so the endpoints existed before this feature — un-excluding the entities in
 * `decisions.json` is what gives them a deliberate, read-only field set.
 *
 * Parent filtering is `?parentId=`, resolved server-side from the AD tab hierarchy
 * (`NeoTypeCoercionHelper.buildParentWhereClause`), NOT from a column name we pass:
 *   - `reconciliations` → `e.account.id = :neoParentId`
 *   - `clearedItems`    → `e.reconciliation.id = :neoParentId`
 */

const BASE_PATH = '/sws/neo/financial-account';

// The generic CRUD defaults to `_endRow` 100 (`applyPaginationDefaults`), so both queries pass it
// explicitly — an account with a long history would otherwise be silently truncated.
const RECONCILIATIONS_PAGE_SIZE = 200;
const CLEARED_ITEMS_PAGE_SIZE = 500;

/**
 * Reconciliation documents of an account, newest first.
 *
 * @param {string|null} accountId
 * @returns {{ reconciliations: Array<object>, loading: boolean, error: Error|null, reload: () => void }}
 */
export function useReconciliations(accountId) {
  const path = accountId
    ? `${BASE_PATH}/reconciliations?parentId=${encodeURIComponent(accountId)}`
      + `&_startRow=0&_endRow=${RECONCILIATIONS_PAGE_SIZE}`
      + '&_sortBy=' + encodeURIComponent('transactionDate desc')
    : null;

  const mapPayload = useMemo(
    () => (raw) => ({ rows: Array.isArray(raw) ? raw : (raw?.rows ?? []) }),
    [],
  );

  const { data, loading, error, reload } = useNeoResource({
    path,
    deps: [accountId],
    mapPayload,
    label: 'useReconciliations',
  });

  return { reconciliations: data?.rows ?? [], loading, error, reload };
}

/**
 * Cleared items of ONE reconciliation. Mounted only while its accordion row is open, so the query
 * fires lazily per expanded row rather than N+1 up front.
 *
 * ⚠ `parentId` must be the RECONCILIATION id, not the account id — the parent FK of
 * `FIN_ReconciliationLine_v` is `FIN_Reconciliation_ID`. Passing the account id silently returns
 * nothing (the same trap documented in purchase-invoice's PaymentDetailsPanelCustom).
 *
 * @param {string|null} reconciliationId
 * @returns {{ items: Array<object>, loading: boolean, error: Error|null }}
 */
export function useClearedItems(reconciliationId) {
  const path = reconciliationId
    ? `${BASE_PATH}/clearedItems?parentId=${encodeURIComponent(reconciliationId)}`
      + `&_startRow=0&_endRow=${CLEARED_ITEMS_PAGE_SIZE}`
    : null;

  const mapPayload = useMemo(
    () => (raw) => ({ rows: Array.isArray(raw) ? raw : (raw?.rows ?? []) }),
    [],
  );

  const { data, loading, error } = useNeoResource({
    path,
    deps: [reconciliationId],
    mapPayload,
    label: 'useClearedItems',
  });

  return { items: data?.rows ?? [], loading, error };
}
