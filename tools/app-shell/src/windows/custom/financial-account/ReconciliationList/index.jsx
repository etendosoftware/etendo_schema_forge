import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useUI } from '@/i18n';
import { getDateBounds } from '@/lib/dateRangeBounds';
import { parseCalendarDate } from '@/lib/dateOnly';
import { DateRangePopover } from '@/components/ui/date-range-popover';
import { AdvancedFilterButton } from '@/components/contract-ui/AdvancedFilterButton.jsx';
import { applyConditions } from '../advancedFilterApply';
import {
  ReconciliationListTable,
  buildReconciliationSortAccessors,
  buildReconciliationSortColumns,
} from './ReconciliationListTable.jsx';
import { ListSortPopover } from '@/components/contract-ui/ListSortPopover.jsx';
import { useClientSort } from '@/hooks/useClientSort';

/**
 * "Reconciliaciones" tab (ETP-4795) — the read-only history of the account's reconciliation
 * documents, i.e. what the cash close produces. Equivalent to Classic's Reconciliations tab plus
 * its Cleared Items child tab.
 *
 * Only rendered for cash accounts (see `DetailTabs.TAB_DEFS`).
 *
 * Laid out like the Movements tab — same toolbar (back arrow, date range, advanced condition
 * filter, search) and the same table-header treatment — but with no summary strip: those KPIs are
 * properties of the account and would only repeat what Movements already shows.
 *
 * Read-only by design: no create, no edit, no process buttons. Served by the generic NEO CRUD over
 * the `financial-account` W spec; every field is `readOnly` in `decisions.json`, and the
 * process/print buttons and the expensive `sqllogic` aggregate columns are `discarded`.
 *
 * The rows arrive as a prop rather than being fetched here: the parent needs the count for the tab
 * badge whether or not this tab is mounted, and fetching in both places would double the request.
 * Filtering stays local — it is view state, not data.
 */
export function ReconciliationListTab({ account, reconciliations = [], loading = false }) {
  const ui = useUI();
  const navigate = useNavigate();
  // Same default as the Movements tab: last 30 days rather than the whole history.
  const [dateRange, setDateRange] = useState({ presetId: 'last30' });
  const [search, setSearch] = useState('');
  const [advancedFilter, setAdvancedFilter] = useState(null);

  const columns = useMemo(() => buildReconciliationFilterColumns(ui), [ui]);

  const filtered = useMemo(
    () => applyConditions(applyFilters(reconciliations, dateRange, search), advancedFilter),
    [reconciliations, dateRange, search, advancedFilter],
  );

  // Sorting lives HERE, not in the table: the "Ordenar por" popover belongs in this toolbar,
  // which is the table's sibling. Same split as ListView/DataTable. Client-side because the
  // whole history arrives in one request (`_endRow=200`) — see lib/clientSort.js.
  const sortAccessors = useMemo(() => buildReconciliationSortAccessors({
    ui,
    postedLabel: (posted) => ui(`financeAccountReconciliationsPosted_${posted}`) || posted || '—',
  }), [ui]);
  const sortColumns = useMemo(() => buildReconciliationSortColumns(ui), [ui]);
  const {
    sorted, sortKey, sortDirection, toggleSort, selectSort, clearSort, isDefaultSort,
  } = useClientSort(filtered, { accessors: sortAccessors });

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="reconciliation-list-tab">
      <div className="flex h-auto min-h-[52px] flex-wrap items-center gap-2 px-2 py-2">
        <button
          type="button"
          aria-label={ui('financeAccountDetailBack')}
          data-testid="reconciliation-list-back"
          onClick={() => navigate(-1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-[hsl(var(--muted))] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__f4e9e1" />
        </button>
        <DateRangePopover
          value={dateRange}
          onChange={setDateRange}
          placeholder={ui('dateRangeAnyTime')}
          data-testid="reconciliation-list-date-range" />
        <AdvancedFilterButton
          columns={columns}
          rows={reconciliations}
          value={advancedFilter}
          onChange={setAdvancedFilter}
          testId="reconciliation-list-advanced-filter"
          data-testid="AdvancedFilterButton__f4e9e1" />
        <div className="flex-1" />
        <ListSortPopover
          columns={sortColumns}
          sortColumn={sortKey}
          sortDirection={sortDirection}
          onSelect={selectSort}
          onClear={clearSort}
          isDefaultSort={isDefaultSort}
          data-testid="ListSortPopover__f4e9e1" />
        <input
          type="search"
          placeholder={ui('financeAccountReconciliationsSearch')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="reconciliation-list-search"
          className="h-10 w-48 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--text-disabled))] shadow-[0_1px_2px_hsl(var(--foreground)_/_0.05)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] focus:ring-offset-1"
        />
      </div>
      <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
        <ReconciliationListTable
          reconciliations={sorted}
          loading={loading}
          currency={account?.currencyIso || 'EUR'}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={toggleSort}
          data-testid="ReconciliationListTable__f4e9e1" />
      </div>
    </div>
  );
}

/**
 * Filterable column metadata for the advanced "by conditions" builder, mirroring
 * `buildMovementFilterColumns`. Keys are the raw row fields the generic CRUD returns, so
 * `applyConditions` can read them without a derivation step.
 */
export function buildReconciliationFilterColumns(ui) {
  return [
    { key: 'documentNo', label: ui('financeAccountReconciliationsColDocumentNo'), type: 'string' },
    { key: 'transactionDate', label: ui('financeAccountReconciliationsColCloseDate'), type: 'date' },
    { key: 'startingbalance', label: ui('financeAccountReconciliationsColStartingBalance'), type: 'number' },
    { key: 'endingBalance', label: ui('financeAccountReconciliationsColEndingBalance'), type: 'number' },
    {
      key: 'documentStatus',
      label: ui('financeAccountReconciliationsColStatus'),
      type: 'enum',
      enumLabels: {
        CO: ui('financeAccountReconciliationsDocStatus_CO'),
        DR: ui('financeAccountReconciliationsDocStatus_DR'),
        VO: ui('financeAccountReconciliationsDocStatus_VO'),
      },
    },
    {
      key: 'posted',
      label: ui('financeAccountReconciliationsColPosted'),
      type: 'enum',
      enumLabels: {
        Y: ui('financeAccountReconciliationsPosted_Y'),
        N: ui('financeAccountReconciliationsPosted_N'),
        D: ui('financeAccountReconciliationsPosted_D'),
        E: ui('financeAccountReconciliationsPosted_E'),
        L: ui('financeAccountReconciliationsPosted_L'),
        p: ui('financeAccountReconciliationsPosted_p'),
        l: ui('financeAccountReconciliationsPosted_l'),
      },
    },
  ];
}

/**
 * Quick-filter pass (date range + free text). The whole history is already in memory (one request,
 * `_endRow=200`), so filtering client-side keeps the toolbar instant instead of round-tripping per
 * keystroke.
 */
function applyFilters(rows, dateRange, search) {
  const { from, to } = getDateBounds(dateRange);
  const q = search.trim().toLowerCase();

  return rows.filter((row) => {
    if (isOutsideDateRange(row.transactionDate, from, to)) return false;
    if (!q) return true;
    return String(row.documentNo ?? '').toLowerCase().includes(q);
  });
}

/**
 * Parses as a CALENDAR date (local y/m/d), not via `new Date()`: the backend sends
 * "yyyy-mm-ddT00:00:00Z", a civil date rather than a real instant, and the naive parser reads it
 * as UTC midnight — which in any timezone behind UTC rolls back a day. Same reasoning as
 * MovementsTab's own helper.
 */
function isOutsideDateRange(dateStr, from, to) {
  if (!from && !to) return false;
  const d = parseCalendarDate(dateStr);
  if (!d) return false;
  return (from && d < from) || (to && d > to);
}
