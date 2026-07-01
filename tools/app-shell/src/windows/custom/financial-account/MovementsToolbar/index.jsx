import { useMemo } from 'react';
import { ArrowLeft, ArrowLeftRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { AdvancedFilterButton } from '@/components/contract-ui/AdvancedFilterButton.jsx';
import { DateRangeFilter } from './DateRangeFilter';
import { TypeFilter } from './TypeFilter';
import { buildMovementFilterColumns } from '../movementAdvancedFilter';

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
  onTransfer,
  rows = [],
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
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:bg-[#F5F7F9] hover:text-foreground"
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
          className="h-10 w-48 rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm text-[#121217] placeholder:text-[#8a8aa3] shadow-[0_1px_2px_rgba(18,18,23,0.05)] focus:outline-none focus:ring-2 focus:ring-[#121217] focus:ring-offset-1"
        />
      </div>
      {/* Transfer funds — occupies the slot of the former "New movement" button. */}
      <button
        type="button"
        data-testid="transfer-funds-button"
        onClick={onTransfer}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#121217] px-3 text-sm font-medium text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217]"
      >
        <ArrowLeftRight className="h-4 w-4" data-testid="ArrowLeftRight__f863ac" />
        {ui('financeAccountTransferAction')}
      </button>
    </div>
  );
}
