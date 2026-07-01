import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.jsx';
import { ChevronDown, CalendarDays, Filter, Loader2 } from 'lucide-react';
import { useLocale, useUI } from '@etendosoftware/app-shell-core';
import { useDistinctValues } from '@/hooks/useDistinctValues.js';
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder.jsx';
import { DistinctValuesList } from './DistinctValuesList.jsx';
import { DateRangePopoverContent } from '@/components/ui/date-range-popover.jsx';

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

  // Label resolution map: enum labels from the column definition when present,
  // otherwise fall back to the shared status dictionary. Used for both the
  // active-status badge and the dropdown items.
  const statusLabelMap = useMemo(() => {
    if (!statusCol) return {};
    if (statusCol.enumLabels && Object.keys(statusCol.enumLabels).length > 0) {
      return { ...statusCol.enumLabels };
    }
    return Object.fromEntries(
      Object.entries(dictionary?.statuses || {})
        .filter(([code]) => /^[A-Z][A-Z0-9_]*$/.test(code))
        .map(([code, entry]) => [code, entry?.label || code]),
    );
  }, [statusCol, dictionary]);

  const labelForStatus = (code) => {
    const enumLabel = statusCol?.enumLabels?.[code];
    if (enumLabel !== undefined) return ui(enumLabel) || enumLabel;
    return dictionary?.statuses?.[code]?.label || code;
  };

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

  // Backend distinct fetch: paginated, server-side search, ignores active
  // columnFilters (so the dropdown shows all values available for the
  // unfiltered dataset).
  const statusDistinct = useDistinctValues(entity, statusCol?.key, {
    enabled: !!(statusCol && entity && apiBaseUrl && statusMenuOpen),
    apiBaseUrl,
  });

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

  // Merge backend + in-memory + currently-active code. Backend order is kept
  // (already sorted alphabetically server-side), in-memory extras are appended.
  // Local search also filters client-side so in-memory-only codes are hidden
  // when they don't match what the user typed.
  const normalizeCode = (c) => {
    if (c === true) return 'true';
    if (c === false) return 'false';
    return c;
  };
  const mergedStatusCodes = useMemo(() => {
    if (!statusCol) return [];
    const seen = new Set();
    const out = [];
    for (const entry of statusDistinct.values) {
      const c = normalizeCode(entry?.id);
      if (c == null || c === '') continue;
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
    const q = statusDistinct.search.trim().toLowerCase();
    for (const c of inMemoryStatusCodes) {
      if (seen.has(c)) continue;
      if (q && !labelForStatus(c).toLowerCase().includes(q) && !String(c).toLowerCase().includes(q)) continue;
      seen.add(c);
      out.push(c);
    }
    if (activeStatusCode && !seen.has(activeStatusCode)) {
      seen.add(activeStatusCode);
      out.push(activeStatusCode);
    }
    return out;
  }, [statusCol, statusDistinct.values, statusDistinct.search, inMemoryStatusCodes, activeStatusCode, statusLabelMap, dictionary]);

  const activeStatusLabel = useMemo(() => {
    if (!activeStatusCode) return ui('allStatuses');
    return labelForStatus(activeStatusCode);
  }, [activeStatusCode, statusLabelMap, dictionary, ui]);

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

  const computePresetRange = (presetId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const to = new Date(today);
    const from = new Date(today);
    if (presetId === 'today') { /* from = to = today */ }
    else if (presetId === 'yesterday') { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); }
    else if (presetId === 'last7') from.setDate(from.getDate() - 6);
    else if (presetId === 'last30') from.setDate(from.getDate() - 29);
    else if (presetId === 'last12m') from.setMonth(from.getMonth() - 12);
    else return null;
    return { from, to };
  };

  const toIsoDate = (d) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

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
    <div className="flex items-center gap-2">
      {statusCol && !hideStatusFilter && (
        <Popover
          open={statusMenuOpen}
          onOpenChange={setStatusMenuOpen}
          data-testid="Popover__6d5e90">
          <PopoverTrigger asChild data-testid="PopoverTrigger__6d5e90">
            <Button
              data-testid="filter-status"
              variant="outline"
              size="sm"
              className={[
                'gap-1.5 font-normal h-9 px-3 rounded-lg bg-white',
                activeStatusCode ? 'text-foreground border-primary/40' : 'text-muted-foreground',
              ].join(' ')}
            >
              {activeStatusLabel}
              {statusDistinct.loading && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                  data-testid="Loader2__6d5e90" />
              )}
              <ChevronDown className="h-3.5 w-3.5" data-testid="ChevronDown__6d5e90" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0" data-testid="PopoverContent__6d5e90">
            <DistinctValuesList
              activeCode={activeStatusCode}
              allLabel={ui('allStatuses')}
              codes={mergedStatusCodes}
              labelFor={labelForStatus}
              distinct={statusDistinct}
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
              variant="outline"
              size="sm"
              className={[
                'gap-1.5 font-normal h-9 px-3 rounded-lg bg-white',
                activeTypeCode ? 'text-foreground border-primary/40' : 'text-muted-foreground',
              ].join(' ')}
            >
              {activeTypeLabel}
              {typeDistinct.loading && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                  data-testid="Loader2__6d5e90" />
              )}
              <ChevronDown className="h-3.5 w-3.5" data-testid="ChevronDown__6d5e90" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0" data-testid="PopoverContent__6d5e90">
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
                'gap-1.5 font-normal h-9 px-3 rounded-lg bg-white',
                hasActiveDate ? 'text-foreground border-primary/40' : 'text-muted-foreground',
              ].join(' ')}
            >
              <CalendarDays className="h-3.5 w-3.5" data-testid="CalendarDays__6d5e90" />
              {activeDateLabel}
              <ChevronDown className="h-3.5 w-3.5" data-testid="ChevronDown__6d5e90" />
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
            className="relative inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground transition-colors hover:bg-[#F5F7F9]"
          >
            <Filter className="h-4 w-4 text-muted-foreground" data-testid="Filter__6d5e90" />
            <span>{ui('filters')}</span>
            {hasActiveAdvancedFilter && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#121217] text-white text-[10px] font-semibold leading-none">
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
            hasActiveFilter={hasActiveFilter}
            labelOverrides={labelOverrides}
            data-testid="AdvancedFilterBuilder__6d5e90" />
        </PopoverContent>
      </Popover>
    </div>
  );
}


export default ListFilterBar;
