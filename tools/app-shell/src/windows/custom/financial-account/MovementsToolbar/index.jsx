import { useMemo } from 'react';
import { ArrowLeft, ArrowLeftRight, ChevronDown, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { AdvancedFilterButton } from '@/components/contract-ui/AdvancedFilterButton.jsx';
import { DateRangeFilter } from './DateRangeFilter';
import { TypeFilter } from './TypeFilter';
import { buildMovementFilterColumns } from '../movementAdvancedFilter';
import { useSplitButtonDropdown } from '../useSplitButtonDropdown';

/**
 * Split-button: primary "Nuevo movimiento" action plus a ▾ trigger that opens a
 * small menu with "Transferir fondos". Mirrors the Imported-statements
 * SplitImport. Closes on outside click / Escape.
 */
function MovementsSplitButton({ ui, onNewMovement, onTransfer }) {
  const { open, setOpen, ref } = useSplitButtonDropdown();

  return (
    <div ref={ref} className="relative flex items-stretch">
      <button
        type="button"
        data-testid="new-movement-button"
        onClick={onNewMovement}
        className="inline-flex h-10 items-center gap-2 rounded-l-lg bg-[hsl(var(--text-primary))] px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-highlight hover:text-accent-highlight-foreground"
      >
        <Plus className="h-4 w-4" data-testid="Plus__f863ac" />
        {ui('financeAccountTxNewAction')}
      </button>
      <button
        type="button"
        aria-label={ui('financeAccountTransferAction')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="new-movement-split"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 w-9 items-center justify-center rounded-r-lg border-l border-primary-foreground/20 bg-[hsl(var(--text-primary))] text-primary-foreground transition-colors hover:bg-accent-highlight hover:text-accent-highlight-foreground"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          data-testid="ChevronDown__f863ac" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-[229px] overflow-hidden rounded-lg border border-[hsl(var(--border-control))] bg-card py-2 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="movements-transfer-menu-item"
            onClick={() => { setOpen(false); onTransfer?.(); }}
            className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-[hsl(var(--page-bg))]"
          >
            <ArrowLeftRight className="h-6 w-6 shrink-0 text-[hsl(var(--text-disabled))]" data-testid="ArrowLeftRight__f863ac" />
            <span className="text-sm text-[hsl(var(--text-primary))]">{ui('financeAccountTransferAction')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Toolbar for the movements tab.
 *
 * Status and amount dropdowns were replaced by the generic "Filtro por
 * condicionales" (AdvancedFilterBuilder), which filters client-side over the
 * movement columns. Date range and type stay (date also drives the KPI window).
 *
 * @param {{
 *   filters: { dateRange: object, type: string|null, search: string },
 *   onFiltersChange: (key: string) => (value: unknown) => void,
 *   advancedFilter: object|null,
 *   onAdvancedFilterChange: (next: object|null) => void,
 *   onNewMovement?: () => void,
 * }} props
 */
export function MovementsToolbar({
  filters,
  onFiltersChange,
  advancedFilter,
  onAdvancedFilterChange,
  onNewMovement,
  onTransfer,
  rows = [],
  // Rendered node, not sort props: the toolbar stays presentational and the tab that owns the
  // sort state decides what goes here. Absent = nothing rendered.
  sortControl = null,
}) {
  const ui = useUI();
  const navigate = useNavigate();
  const columns = useMemo(() => buildMovementFilterColumns(ui), [ui]);

  return (
    <div className="flex h-auto min-h-[52px] flex-wrap items-center gap-2 px-2 py-2">
      {/* Back */}
      <button
        type="button"
        aria-label={ui('financeAccountDetailBack')}
        data-testid="movements-toolbar-back"
        onClick={() => navigate(-1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-[hsl(var(--muted))] hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__f863ac" />
      </button>
      {/* Quick filters — type/status first, then date, mirroring the standard
          list toolbar (e.g. Sales Order). */}
      <TypeFilter
        value={filters.type}
        onChange={onFiltersChange('type')}
        data-testid="TypeFilter__f863ac" />
      <DateRangeFilter
        value={filters.dateRange}
        onChange={onFiltersChange('dateRange')}
        data-testid="DateRangeFilter__f863ac" />
      {/* Advanced "by conditions" filter — right after the Type filter */}
      <AdvancedFilterButton
        columns={columns}
        rows={rows}
        value={advancedFilter}
        onChange={onAdvancedFilterChange}
        testId="movements-advanced-filter"
        data-testid="AdvancedFilterButton__f863ac" />
      {/* Search */}
      <div className="flex-1" />
      <div className="relative flex items-center">
        <input
          type="search"
          placeholder={ui('financeAccountMovementsSearch')}
          value={filters.search}
          onChange={(e) => onFiltersChange('search')(e.target.value)}
          data-testid="movements-search-input"
          className="h-10 w-48 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--text-disabled))] shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] focus:ring-offset-1"
        />
      </div>
      {sortControl}
      {/* Split button: primary "Nuevo movimiento" (opens the GL-item modal) +
          a ▾ menu with "Transferir fondos". */}
      <MovementsSplitButton
        ui={ui}
        onNewMovement={onNewMovement}
        onTransfer={onTransfer}
        data-testid="MovementsSplitButton__f863ac" />
    </div>
  );
}
