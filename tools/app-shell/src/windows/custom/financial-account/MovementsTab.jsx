import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useMemo } from 'react';
import { AccountSummaryStrip } from './AccountSummaryStrip';
import { MovementsToolbar } from './MovementsToolbar/index';
import { MovementsTable } from './MovementsTable';
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
  // "Eliminar" already makes (useDeleteMovement — a Draft is removed directly, a
  // Processed one is reactivated + removed server-side); not every movement is
  // deletable (payment-linked ones aren't, see MovementRowKebab's canDelete), so
  // attempting to delete one of those surfaces as a normal per-row failure in the
  // 3-outcome toast rather than being pre-filtered out of the selection.
  const { deleteMovement } = useDeleteMovement();
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const { requestBatchDelete, batchDeleteDialog, deleting: bulkDeleting } = useBatchDeleteDialog({
    deleteOneFn: (id) => deleteMovement({ id }),
    onOutcome: (succeeded, failed) => {
      if (succeeded.length > 0) onReload?.();
      if (failed.length === 0) {
        clearSelection();
      } else {
        setSelectedIds(new Set(failed));
      }
    },
  });

  const filteredMovements = useMemo(
    () => applyAdvancedFilter(applyFilters(movements, filters), advancedFilter),
    [movements, filters, advancedFilter],
  );

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
      {selectedIds.size > 0 && (
        <div className="border-b border-[#E8EAEF] px-2 py-2">
          <BulkDeleteSelectionBar
            count={selectedIds.size}
            deleting={bulkDeleting}
            onCancel={clearSelection}
            onDelete={() => requestBatchDelete(Array.from(selectedIds))}
            data-testid="MovementsBulkDeleteSelectionBar__c1f76a" />
        </div>
      )}
      <MovementsToolbar
        filters={filters}
        onFiltersChange={handleFilterChange}
        advancedFilter={advancedFilter}
        onAdvancedFilterChange={setAdvancedFilter}
        onNewMovement={() => setNewMovementOpen(true)}
        onTransfer={() => setTransferOpen(true)}
        rows={movements}
        data-testid="MovementsToolbar__c1f76a" />
      <AccountSummaryStrip
        account={account}
        totals={dateScopedTotals}
        loading={loading}
        data-testid="AccountSummaryStrip__c1f76a" />
      <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
        <MovementsTable
          movements={filteredMovements}
          loading={loading}
          enabledDimensions={enabledDimensions}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          highlightTxnId={highlightTxnId}
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
