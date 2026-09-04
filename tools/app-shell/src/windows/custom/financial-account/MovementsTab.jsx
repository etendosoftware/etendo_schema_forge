import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useMemo } from 'react';
import { AccountSummaryStrip } from './AccountSummaryStrip';
import { MovementsToolbar } from './MovementsToolbar/index';
import {
  MovementsTable,
  useTrxTypeLabel,
  buildMovementSortCtx,
  buildMovementSortAccessors,
  buildMovementSortColumns,
} from './MovementsTable';
import { ListSortPopover } from '@/components/contract-ui/ListSortPopover.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { useClientSort } from '@/hooks/useClientSort';
import { useUI } from '@/i18n';
import { NewTransactionModal } from './NewTransactionModal.jsx';
import { FundsTransferModal } from './FundsTransferModal.jsx';
import { applyAdvancedFilter } from './movementAdvancedFilter';
import { getDateBounds } from '@/lib/dateRangeBounds';
import { parseCalendarDate } from '@/lib/dateOnly';
import { useDeleteMovement } from '@/hooks/useCreateMovement';
import { useBatchDeleteDialog } from '@/hooks/useBatchDeleteDialog.jsx';
import { BulkDeleteSelectionBar } from '@/components/financial-accounts';

// ---------------------------------------------------------------------------
// KPI window suffix (shown in parentheses next to Inflows / Outflows labels)
// ---------------------------------------------------------------------------

const PRESET_TO_SUFFIX = {
  today:     { key: 'financeAccountDetailKpiWindowToday',     params: null },
  yesterday: { key: 'financeAccountDetailKpiWindowYesterday', params: null },
  last7:     { key: 'financeAccountDetailKpiWindowDays',      params: { count: 7 } },
  last30:    { key: 'financeAccountDetailKpiWindowDays',      params: { count: 30 } },
  last12m:   { key: 'financeAccountDetailKpiWindowMonths',    params: { count: 12 } },
};

function kpiWindowSuffix(dateRange) {
  if (!dateRange) return null;
  if ('presetId' in dateRange) return PRESET_TO_SUFFIX[dateRange.presetId] ?? null;
  if ('from' in dateRange && 'to' in dateRange) {
    return { key: 'financeAccountDetailKpiWindowRange', params: null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main filter function — quick filters (date range, type, search). Status and
// amount moved to the advanced "by conditions" filter (applyAdvancedFilter).
// ---------------------------------------------------------------------------

// Date range check shared by applyFilters and dateScopedTotals — parses as a
// calendar date (year/month/day in LOCAL time), not via the naive Date
// constructor: the backend sends "yyyy-mm-ddT00:00:00Z" (a civil date, not a
// real instant), which the naive parser reads as UTC midnight — in any
// timezone behind UTC that rolls back to the previous day, so a single-day
// range around the movement's own date matched nothing.
function isOutsideDateRange(dateStr, from, to) {
  if (!from && !to) return false;
  const d = parseCalendarDate(dateStr);
  if (!d) return false;
  return (from && d < from) || (to && d > to);
}

function matchesSearch(m, q) {
  if (!q) return true;
  const haystack = [m.documentNo, m.contact, m.description]
    .map((s) => (s ?? '').toLowerCase())
    .join(' ');
  return haystack.includes(q);
}

function applyFilters(movements, filters) {
  const { from, to } = getDateBounds(filters.dateRange);
  const q = filters.search.trim().toLowerCase();

  return movements.filter((m) => {
    if (isOutsideDateRange(m.date, from, to)) return false;
    if (filters.type && m.trxType !== filters.type) return false;
    return matchesSearch(m, q);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Movements tab content: summary strip + toolbar + table.
 *
 * Exposes `getFilteredMovements()` via ref so the parent's Export button can
 * grab the currently-visible rows without owning the filter state.
 *
 * @param {{
 *   account: object|null,
 *   totals: { balance: number, inflows: number, outflows: number, currency: string },
 *   movements: Array<object>,
 *   loading: boolean
 * }} props
 */
export const MovementsTab = forwardRef(function MovementsTab(
  { account, totals, movements, enabledDimensions = [], headerDimensions = [], loading, onReload, highlightTxnId = null, autoOpenNewMovement = false },
  ref,
) {
  const [filters, setFilters] = useState({
    dateRange: { presetId: 'last30' },
    type: null,
    search: '',
  });
  const [advancedFilter, setAdvancedFilter] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [newMovementOpen, setNewMovementOpen] = useState(false);
  const [editMovement, setEditMovement] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);

  // Deep-link from the accounts grid ("Nuevo movimiento" row action) opens the
  // modal once when the tab mounts with the flag set.
  useEffect(() => {
    if (autoOpenNewMovement) setNewMovementOpen(true);
  }, [autoOpenNewMovement]);

  const handleFilterChange = (key) => (val) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
  };

  const handleSelectionChange = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ETP-4656 (Gap 2) — bulk "Delete selected" for the movements grid, wired onto
  // the checkbox selection that already existed here. Reuses the same
  // POST .../financial-account-transactions?action=delete call the per-row kebab's
  // "Eliminar" already makes (useDeleteMovement).
  //
  // ETP-5111 — the delete SEMANTICS now depend on the size of the selection, for parity with
  // Classic's own toolbar: exactly ONE selected row means Payment Removal (the backend
  // reactivates and then removes, so a processed/posted movement can be deleted), while TWO
  // or more mean a plain delete per row, which the DB trigger
  // (APRM_FIN_FINACC_TRAN_CHECK_TRG) refuses for any row that is still processed. The flag is
  // captured in a ref at click time because `deleteOneFn` is held by `useBatchDeleteDialog`
  // across the confirm dialog and would otherwise read a stale closure over `selectedIds`.
  //
  // The trash button itself is NEVER pre-disabled by row eligibility (the unified delete rule):
  // a row the backend refuses — payment-linked, funds-transfer leg, or processed inside a
  // multi-row batch — surfaces as an ordinary per-row failure in the 3-outcome toast, and the
  // reason is spelled out only when a single row was selected.
  const { deleteMovement } = useDeleteMovement();
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const paymentRemovalRef = useRef(true);
  const { requestBatchDelete, batchDeleteDialog, deleting: bulkDeleting } = useBatchDeleteDialog({
    deleteOneFn: (id) => deleteMovement({ id, paymentRemoval: paymentRemovalRef.current }),
    onOutcome: (succeeded, failed) => {
      if (succeeded.length > 0) onReload?.();
      if (failed.length === 0) {
        clearSelection();
      } else {
        setSelectedIds(new Set(failed));
      }
    },
  });
  const requestDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    // 1 → Payment Removal · N → plain delete.
    paymentRemovalRef.current = ids.length === 1;
    requestBatchDelete(ids);
  }, [selectedIds, requestBatchDelete]);

  const filteredMovements = useMemo(
    () => applyAdvancedFilter(applyFilters(movements, filters), advancedFilter),
    [movements, filters, advancedFilter],
  );

  // Sorting lives HERE, not in the table: the "Ordenar por" popover belongs in the toolbar,
  // which is the table's sibling. Same split as ListView/DataTable. Client-side because this
  // list arrives whole from a handler that accepts no sort parameter — see lib/clientSort.js.
  const ui = useUI();
  const getTrxTypeLabel = useTrxTypeLabel();
  const sortAccessors = useMemo(
    () => buildMovementSortAccessors(buildMovementSortCtx(ui, getTrxTypeLabel)),
    // `ui` and `getTrxTypeLabel` are stable per locale; rebuilding on every render would defeat
    // the memo the accessors feed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const sortColumns = useMemo(() => buildMovementSortColumns(ui), [ui]);
  const {
    sorted: sortedMovements, sortKey, sortDirection, toggleSort, selectSort, clearSort,
    isDefaultSort,
  } = useClientSort(filteredMovements, { accessors: sortAccessors });

  // Latest filtered list is also reachable via ref so the parent's Export
  // button can read it on click without subscribing to filter changes.
  const filteredRef = useRef(filteredMovements);
  filteredRef.current = filteredMovements;
  useImperativeHandle(ref, () => ({
    getFilteredMovements: () => filteredRef.current,
  }), []);

  // Recompute inflows/outflows from the date-filtered movements (ignores
  // status/type/amount/search filters so the KPIs only react to the date range,
  // matching how Classic's "30D" widget worked but tied to the active window).
  const dateScopedTotals = useMemo(() => {
    const { from, to } = getDateBounds(filters.dateRange);
    let inflows = 0;
    let outflows = 0;
    for (const m of movements) {
      if (isOutsideDateRange(m.date, from, to)) continue;
      const amt = Number(m.amount) || 0;
      if (amt >= 0) inflows += amt;
      else outflows += amt;
    }
    return {
      balance: totals.balance,
      currency: totals.currency,
      inflows,
      outflows,
      windowSuffix: kpiWindowSuffix(filters.dateRange),
    };
  }, [movements, filters.dateRange, totals.balance, totals.currency]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ETP-4972 — BulkDeleteSelectionBar now portals to a floating,
          viewport-fixed pill via SelectionToolbar; it no longer occupies a
          slot in this flow (the wrapping div here used to reserve space for
          the old in-flow bar). */}
      <BulkDeleteSelectionBar
        count={selectedIds.size}
        deleting={bulkDeleting}
        onCancel={clearSelection}
        onDelete={requestDelete}
        data-testid="MovementsBulkDeleteSelectionBar__c1f76a" />
      <MovementsToolbar
        filters={filters}
        onFiltersChange={handleFilterChange}
        advancedFilter={advancedFilter}
        onAdvancedFilterChange={setAdvancedFilter}
        onNewMovement={() => setNewMovementOpen(true)}
        onTransfer={() => setTransferOpen(true)}
        onRefresh={onReload}
        rows={movements}
        sortControl={(
          <ListSortPopover
            columns={sortColumns}
            sortColumn={sortKey}
            sortDirection={sortDirection}
            onSelect={selectSort}
            onClear={clearSort}
            isDefaultSort={isDefaultSort}
            data-testid="ListSortPopover__c1f76a" />
        )}
        data-testid="MovementsToolbar__c1f76a" />
      <AccountSummaryStrip
        account={account}
        totals={dateScopedTotals}
        loading={loading}
        data-testid="AccountSummaryStrip__c1f76a" />
      {/* Same affordance a generated list gets from ListView: the rows stay put and dim while
          refreshing, and this says why. Only when rows are already on screen — on the first
          fetch the table's own skeleton is the indicator. */}
      {loading && movements.length > 0 ? (
        <ListProgressBar testId="movements-progress-bar" data-testid="ListProgressBar__c1f76a" />
      ) : null}
      <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
        <MovementsTable
          movements={sortedMovements}
          loading={loading}
          enabledDimensions={enabledDimensions}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          highlightTxnId={highlightTxnId}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={toggleSort}
          onReload={onReload}
          onEdit={setEditMovement}
          data-testid="MovementsTable__c1f76a" />
      </div>
      {batchDeleteDialog}
      <NewTransactionModal
        open={newMovementOpen || !!editMovement}
        accountId={account?.id}
        accountName={account?.name ?? ''}
        accountCurrency={account?.currencyIso
          ? { id: account?.currencyId, iso: account.currencyIso }
          : null}
        dimensions={headerDimensions}
        movement={editMovement}
        onClose={() => { setNewMovementOpen(false); setEditMovement(null); }}
        onSuccess={() => onReload?.()}
        data-testid="NewTransactionModal__c1f76a" />
      {transferOpen ? (
        <FundsTransferModal
          sourceAccountId={account?.id}
          onClose={() => setTransferOpen(false)}
          onSuccess={() => onReload?.()}
          data-testid="FundsTransferModal__c1f76a" />
      ) : null}
    </div>
  );
});
