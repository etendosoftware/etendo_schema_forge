import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.jsx';
import { ChevronDown, CalendarDays, Filter, Loader2 } from 'lucide-react';
import { useLocale, useUI } from '@etendosoftware/app-shell-core';
import { useDistinctValues } from '@/hooks/useDistinctValues.js';
import { compareStatusCodes, getStatusTone, statusLabel } from '@/lib/statusBadge.js';
import { StatusTag } from '@/components/ui/status-tag';
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder.jsx';
import { DistinctValuesList } from './DistinctValuesList.jsx';
import { DateRangePopoverContent } from '@/components/ui/date-range-popover.jsx';
import { computePresetRange, toIsoDate } from './datePresetFilter.js';

// Case- and accent-insensitive form of a string for client-side option search
// ("borr" / "Borr" / "bórr" all match "Borrador"): NFD, strip combining marks, lowercase.
const normalizeSearchText = (s) => String(s ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

// ETP-5601 — Figma's toolbar type: text-sm/leading-6/font-medium in #121217 for every text
// control, idle or active. An active filter is told apart by its border alone. `text-[#121217]`
// already has a dark-mode remap in the core stylesheet. Icons are 20px in
// #828FA3; `[&_svg]:` is needed because the core Button forces `[&_svg]:size-4` on its children.
// The chevron is the exception: `!size-4` (16px box, ~8px glyph as in Figma) must beat the
// parent `[&_svg]:size-5` selector, which outranks a plain class on the icon itself.
const TOOLBAR_SELECT_CLASS = 'gap-1.5 text-sm leading-6 font-medium text-[#121217] h-10 px-3 rounded-lg bg-card data-[state=open]:border-[hsl(var(--foreground))] [&_svg]:size-5 [&_svg]:text-[#828FA3]';

/**
 * Quick-filter toolbar rendered above the list table.
 *
 * Shortcuts:
 *   - Status selector: shown when a column has type='status'.
 *   - Date range selector: shown only when `dateFilterKey` points to a column
 *     with type='date'. No implicit fallback to the first date column.
 *   - Funnel popover: placeholder for the upcoming advanced-filter builder.
 *
 * Filters are committed through the same onFilterChange pipeline used by the
 * DataTable, so the backend query layer (gridQuery.buildBackendFilter) is
 * unchanged.
 */
export function ListFilterBar({
  entity = null,
  apiBaseUrl = null,
  columns = [],
  columnFilters = {},
  onFilterChange,
  advancedFilter = null,
  onAdvancedFilterChange,
  rows = [],
  dateFilterKey = null,
  presets = null,
  onApplyPreset = null,
  onSavePreset = null,
  onDeletePreset = null,
  labelOverrides = null,
  hideStatusFilter = false,
  // ETP-5509 — render the controls as items of the PARENT flex container (`display: contents`)
  // instead of a nowrap row of their own, so a wrapping parent (the list toolbar's filters
  // cluster) can move them onto a new line one by one when space runs out.
  flowInParent = false,
  // (excludeKeys) => URL-params string of the list's current filters minus those column
  // filters (ETP-5561). Absent -> the status options are not narrowed (previous behaviour).
  buildDistinctQuery = null,
}) {
  const ui = useUI();
  const dictionary = useLocale();

  const statusCol = useMemo(
    () => columns.find(c => c.type === 'status') || null,
    [columns],
  );

  const typeCol = useMemo(
    () => columns.find(c => c.isTypeFilter) || null,
    [columns],
  );

  const dateCol = useMemo(
    () => {
      if (!dateFilterKey) return null;
      const col = columns.find(c => c.key === dateFilterKey);
      return col && col.type === 'date' ? col : null;
    },
    [columns, dateFilterKey],
  );

  const activeStatus = columnFilters?.[statusCol?.key]?.value;
  const activeStatusCode = Array.isArray(activeStatus) ? activeStatus[0] : null;

  // Delegates to the same statusLabel() resolution used by the grid cells
  // (DataTable.cellRenderers.jsx) so the dropdown and the column never
  // diverge: DB-sourced translation (dictionary.statuses) first, then the
  // shared i18n-key MAP, then the ui() translate function, before falling
  // back to a literal AD label. Fixes ETP-4696 Problem 2 (statuses like
  // "Booked"/"Voided"/"Not Accepted" showing untranslated in the filter
  // dropdown while the grid cell translated them correctly).
  const labelForStatus = (code) => statusLabel(code, dictionary, ui, statusCol?.enumLabels);

  // In-memory distinct codes from the rows currently loaded — shown instantly
  // so the dropdown is never empty while the backend fetch is in-flight.
  const inMemoryStatusCodes = useMemo(() => {
    if (!statusCol) return [];
    const seen = new Set();
    for (const r of rows || []) {
      let v = r?.[statusCol.key];
      if (v === true) v = 'true';
      else if (v === false) v = 'false';
      if (v !== null && v !== undefined && v !== '') seen.add(v);
    }
    return Array.from(seen);
  }, [rows, statusCol]);

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  // The status search is client-side only: the backend matches the stored CODE, not the
  // translated label, so the typed text is never sent as `_distinctSearch`. The status
  // value set is small and is fetched whole once per menu open / extraParams change.
  const [statusSearch, setStatusSearch] = useState('');

  // Backend distinct fetch: paginated, server-side search. Options follow the current view
  // (subset tab, date range, advanced filter, other column filters) but exclude the status
  // filter itself, so picking one status keeps the others listed.
  const statusExtraParams = useMemo(
    () => (statusCol && buildDistinctQuery ? buildDistinctQuery([statusCol.key]) : ''),
    [statusCol, buildDistinctQuery],
  );
  const statusDistinct = useDistinctValues(entity, statusCol?.key, {
    enabled: !!(statusCol && entity && apiBaseUrl && statusMenuOpen),
    apiBaseUrl,
    extraParams: statusExtraParams,
  });
  // What DistinctValuesList receives: the hook's state, but with the search box bound to the
  // LOCAL state. Its unmount cleanup (`setSearch('')`) therefore resets the local text, and
  // the hook's own search stays '' so typing never refetches.
  const { values: statusValues, loading: statusLoading, hasMore: statusHasMore,
    loadMore: statusLoadMore, loadingMore: statusLoadingMore } = statusDistinct;
  const statusDistinctView = useMemo(() => ({
    ...statusDistinct,
    search: statusSearch,
    setSearch: setStatusSearch,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [statusValues, statusLoading, statusHasMore, statusLoadMore, statusLoadingMore, statusSearch]);

  const activeType = columnFilters?.[typeCol?.key]?.value;
  const activeTypeCode = Array.isArray(activeType) ? activeType[0] : null;

  const inMemoryTypeCodes = useMemo(() => {
    if (!typeCol) return [];
    const backendKey = typeCol.backendFilterKey || typeCol.key;
    const seen = new Set();
    for (const r of rows || []) {
      const v = r?.[backendKey] ?? r?.[`${typeCol.key}$_identifier`];
      if (v !== null && v !== undefined && v !== '') seen.add(String(v));
    }
    return Array.from(seen);
  }, [rows, typeCol]);

  const [typeMenuOpen, setTypeMenuOpen] = useState(false);

  const typeDistinct = useDistinctValues(
    entity,
    typeCol ? (typeCol.backendFilterKey || typeCol.key) : null,
    { enabled: !!(typeCol && entity && apiBaseUrl && typeMenuOpen), apiBaseUrl },
  );

  const labelForType = (code) => {
    const enumLabel = typeCol?.enumLabels?.[code];
    if (enumLabel !== undefined) return ui(enumLabel) || enumLabel;
    return code;
  };

  const activeTypeLabel = useMemo(() => {
    if (!activeTypeCode) return ui('allTypes');
    return labelForType(activeTypeCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTypeCode, typeCol, ui]);

  const mergedTypeCodes = useMemo(() => {
    if (!typeCol) return [];
    const seen = new Set();
    const out = [];
    for (const entry of typeDistinct.values) {
      const c = entry?.id;
      if (c == null || c === '') continue;
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
    for (const c of inMemoryTypeCodes) {
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
    if (activeTypeCode && !seen.has(activeTypeCode)) {
      seen.add(activeTypeCode); out.push(activeTypeCode);
    }
    return out;
  }, [typeCol, typeDistinct.values, inMemoryTypeCodes, activeTypeCode]);

  const handleTypeSelect = (code) => {
    if (!typeCol) return;
    const parsed = code
      ? { mode: 'enumLabel', value: [code], originalValue: code }
      : null;
    onFilterChange?.(typeCol.key, parsed);
  };

  // Merge backend + in-memory + currently-active code, then sort by the fixed
  // business-flow order (compareStatusCodes) so the dropdown order never
  // changes between renders — regardless of whether it paints from in-memory
  // rows first or reorders once the (uncached) backend distinct-values fetch
  // resolves. Without this, the two sources arrive in different orders and
  // the user sees the options visibly reshuffle on every open.
  const normalizeCode = (c) => {
    if (c === true) return 'true';
    if (c === false) return 'false';
    return c;
  };
  // ETP-5561 — a code is listed only if it produces a visible label. Whitespace-only
  // codes (or codes whose label resolves to blank) would otherwise render as empty rows
  // in the menu, e.g. a window with no records for its status column.
  const isListableStatusCode = (c) => {
    if (c == null || String(c).trim() === '') return false;
    const label = labelForStatus(c);
    return label != null && String(label).trim() !== '';
  };
  const mergedStatusCodes = useMemo(() => {
    if (!statusCol) return [];
    const seen = new Set();
    const out = [];
    for (const entry of statusDistinct.values) {
      const c = normalizeCode(entry?.id);
      if (!isListableStatusCode(c)) continue;
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
    for (const c of inMemoryStatusCodes) {
      if (seen.has(c) || !isListableStatusCode(c)) continue;
      seen.add(c);
      out.push(c);
    }
    if (activeStatusCode && !seen.has(activeStatusCode) && isListableStatusCode(activeStatusCode)) {
      seen.add(activeStatusCode);
      out.push(activeStatusCode);
    }
    // Search applies to every merged source (including the active code: when it does not
    // match the query it is filtered out like any other option). Matches the displayed
    // label only: raw codes are never shown to the user, so matching them would list
    // options for reasons the user cannot see.
    const q = normalizeSearchText(statusSearch.trim());
    const matched = q
      ? out.filter((c) => normalizeSearchText(labelForStatus(c)).includes(q))
      : out;
    return matched.slice().sort(compareStatusCodes);
  }, [statusCol, statusValues, statusSearch, inMemoryStatusCodes, activeStatusCode, dictionary]);

  const activeStatusLabel = useMemo(() => {
    if (!activeStatusCode) return ui('allStatuses');
    return labelForStatus(activeStatusCode);
  }, [activeStatusCode, dictionary, ui]);

  // Same tag (StatusTag + getStatusTone) the grid's status column renders. The wrapper reserves
  // the right gutter for the selected-row check on every row (no shift) and lets a long label
  // truncate with an ellipsis instead of overflowing the menu.
  const renderStatusOption = (code, label) => (
    <span className="flex min-w-0 max-w-full pr-4" title={label} data-testid="StatusTag__filter-option">
      <StatusTag
        status={code}
        label={label}
        tone={getStatusTone(code)}
        className="!inline-block min-w-0 max-w-full truncate tracking-[-0.005em]" />
    </span>
  );

  const handleStatusSelect = (code) => {
    if (!statusCol) return;
    const parsed = code
      ? { mode: 'enumLabel', value: [code], originalValue: code }
      : null;
    onFilterChange?.(statusCol.key, parsed);
  };

  const activeDateFilter = columnFilters?.[dateCol?.key] || null;
  const activeDateOriginal = activeDateFilter?.originalValue;
  const activeDatePresetId = typeof activeDateOriginal === 'string' && activeDateOriginal.startsWith('preset:')
    ? activeDateOriginal.slice('preset:'.length)
    : null;
  const isCustomRange = typeof activeDateOriginal === 'string' && activeDateOriginal.startsWith('custom:');
  const activeDateRange = (() => {
    if (!activeDateFilter) return null;
    const v = activeDateFilter.value;
    if (Array.isArray(v) && v.length === 2) {
      const from = v[0] ? new Date(`${v[0]}T00:00:00`) : null;
      const to = v[1] ? new Date(`${v[1]}T00:00:00`) : null;
      if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        return { from, to };
      }
    }
    return null;
  })();

  const datePresets = useMemo(() => ([
    { id: 'today', label: ui('dateRangeToday') },
    { id: 'yesterday', label: ui('dateRangeYesterday') },
    { id: 'last7', label: ui('dateRangeLast7Days') },
    { id: 'last30', label: ui('dateRangeLast30Days') },
    { id: 'last12m', label: ui('dateRangeLast12Months') },
    { id: 'allTime', label: ui('dateRangeAllTime') },
  ]), [ui]);

  const activeDateLabel = activeDatePresetId
    ? (datePresets.find(p => p.id === activeDatePresetId)?.label || ui('dateRangeAnyTime'))
    : isCustomRange
      ? ui('dateRangeCustom')
      : ui('dateRangeAnyTime');

  const emitDateFilter = (range, originalValue) => {
    if (!dateCol) return;
    if (!range) {
      onFilterChange?.(dateCol.key, null);
      return;
    }
    onFilterChange?.(dateCol.key, {
      mode: 'date',
      op: 'range',
      value: [toIsoDate(range.from), toIsoDate(range.to)],
      originalValue,
    });
  };

  const [dateMenuOpen, setDateMenuOpen] = useState(false);

  // Adapter: convert the active list-filter shape into the value expected by
  // DateRangePopoverContent (null | { presetId } | { from, to }).
  const dateRangeValue = (() => {
    if (!activeDateFilter) return null;
    if (activeDatePresetId) return { presetId: activeDatePresetId };
    if (isCustomRange && activeDateRange) return { from: activeDateRange.from, to: activeDateRange.to };
    return null;
  })();

  // Adapter: convert DateRangePopoverContent's onChange value into the
  // list-filter emit format and push it through onFilterChange.
  const handleDateRangeChange = (v) => {
    if (!v) {
      emitDateFilter(null, null);
      return;
    }
    if ('presetId' in v) {
      const range = computePresetRange(v.presetId);
      if (!range) {
        emitDateFilter(null, null);
        return;
      }
      emitDateFilter(range, `preset:${v.presetId}`);
      return;
    }
    emitDateFilter(
      { from: v.from, to: v.to },
      `custom:${toIsoDate(v.from)}:${toIsoDate(v.to)}`,
    );
  };

  const hasActiveColumnFilter = Object.values(columnFilters || {}).some(Boolean);
  const hasActiveAdvancedFilter = !!advancedFilter?.conditions?.length;
  const hasActiveFilter = hasActiveColumnFilter || hasActiveAdvancedFilter;
  const hasActiveDate = !!activeDateFilter;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={flowInParent ? 'contents' : 'flex items-center gap-2'}>
      {statusCol && !hideStatusFilter && (
        <Popover
          open={statusMenuOpen}
          onOpenChange={setStatusMenuOpen}
          data-testid="Popover__6d5e90">
          <PopoverTrigger asChild data-testid="PopoverTrigger__6d5e90">
            <Button
              data-testid="filter-status"
              aria-haspopup="listbox"
              variant="outline"
              size="sm"
              className={[
                TOOLBAR_SELECT_CLASS,
                activeStatusCode ? 'border-primary/40' : '',
              ].join(' ')}
            >
              {activeStatusLabel}
              {statusLoading && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                  data-testid="Loader2__6d5e90" />
              )}
              <ChevronDown className="!size-4" data-testid="ChevronDown__6d5e90" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-0" data-testid="PopoverContent__6d5e90">
            <DistinctValuesList
              activeCode={activeStatusCode}
              allLabel={ui('allStatuses')}
              codes={mergedStatusCodes}
              labelFor={labelForStatus}
              renderOption={renderStatusOption}
              distinct={statusDistinctView}
              onSelect={(code) => {
                handleStatusSelect(code);
                setStatusMenuOpen(false);
              }}
              searchPlaceholder={ui('searchStatuses')}
              data-testid="DistinctValuesList__6d5e90" />
          </PopoverContent>
        </Popover>
      )}
      {typeCol && (
        <Popover
          open={typeMenuOpen}
          onOpenChange={setTypeMenuOpen}
          data-testid="Popover__6d5e90">
          <PopoverTrigger asChild data-testid="PopoverTrigger__6d5e90">
            <Button
              data-testid="filter-type"
              aria-haspopup="listbox"
              variant="outline"
              size="sm"
              className={[
                TOOLBAR_SELECT_CLASS,
                activeTypeCode ? 'border-primary/40' : '',
              ].join(' ')}
            >
              {activeTypeLabel}
              {typeDistinct.loading && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                  data-testid="Loader2__6d5e90" />
              )}
              <ChevronDown className="!size-4" data-testid="ChevronDown__6d5e90" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-0" data-testid="PopoverContent__6d5e90">
            <DistinctValuesList
              activeCode={activeTypeCode}
              allLabel={ui('allTypes')}
              codes={mergedTypeCodes}
              labelFor={labelForType}
              distinct={typeDistinct}
              onSelect={(code) => {
                handleTypeSelect(code);
                setTypeMenuOpen(false);
              }}
              searchPlaceholder={ui('searchTypes')}
              data-testid="DistinctValuesList__6d5e90" />
          </PopoverContent>
        </Popover>
      )}
      {dateCol && (
        <Popover
          open={dateMenuOpen}
          onOpenChange={setDateMenuOpen}
          data-testid="Popover__6d5e90">
          <PopoverTrigger asChild data-testid="PopoverTrigger__6d5e90">
            <Button
              data-testid="filter-date"
              variant="outline"
              size="sm"
              className={[
                TOOLBAR_SELECT_CLASS,
                hasActiveDate ? 'border-primary/40' : '',
              ].join(' ')}
            >
              <CalendarDays className="h-3.5 w-3.5" data-testid="CalendarDays__6d5e90" />
              {activeDateLabel}
              <ChevronDown className="!size-4" data-testid="ChevronDown__6d5e90" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0" data-testid="PopoverContent__6d5e90">
            <DateRangePopoverContent
              value={dateRangeValue}
              onChange={handleDateRangeChange}
              onClose={() => setDateMenuOpen(false)}
              data-testid="DateRangePopoverContent__6d5e90" />
          </PopoverContent>
        </Popover>
      )}
      <Popover
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        data-testid="Popover__6d5e90">
        <PopoverTrigger asChild data-testid="PopoverTrigger__6d5e90">
          <button
            type="button"
            data-testid="filter-advanced"
            className="relative inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm leading-6 font-medium text-[#121217] transition-colors hover:bg-[hsl(var(--muted))]"
          >
            <Filter className="h-5 w-5 text-[#828FA3]" data-testid="Filter__6d5e90" />
            <span>{ui('filters')}</span>
            {hasActiveAdvancedFilter && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[hsl(var(--foreground))] text-primary-foreground text-[10px] font-semibold leading-none">
                {advancedFilter.conditions.length}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-4" data-testid="PopoverContent__6d5e90">
          <AdvancedFilterBuilder
            entity={entity}
            apiBaseUrl={apiBaseUrl}
            columns={columns}
            rows={rows}
            value={advancedFilter}
            onApply={(next) => onAdvancedFilterChange?.(next)}
            onClear={() => onAdvancedFilterChange?.(null)}
            onClose={() => setAdvancedOpen(false)}
            presets={presets}
            onApplyPreset={onApplyPreset}
            onSavePreset={onSavePreset}
            onDeletePreset={onDeletePreset}
            hasActiveColumnFilter={hasActiveColumnFilter}
            labelOverrides={labelOverrides}
            data-testid="AdvancedFilterBuilder__6d5e90" />
        </PopoverContent>
      </Popover>
    </div>
  );
}


export default ListFilterBar;
