import { useMemo, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.jsx';
import { Calendar } from '@/components/ui/calendar.jsx';
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays, Filter, Check, Loader2 } from 'lucide-react';
import { useLocale, useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { useDistinctValues } from '@/hooks/useDistinctValues.js';
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder.jsx';
import { DistinctValuesList } from './DistinctValuesList.jsx';

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
}) {
  const ui = useUI();
  const dictionary = useLocale();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');

  const statusCol = useMemo(
    () => columns.find(c => c.type === 'status') || null,
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

  const labelForStatus = (code) =>
    dictionary?.statuses?.[code]?.label || statusLabelMap[code] || code;

  // In-memory distinct codes from the rows currently loaded — shown instantly
  // so the dropdown is never empty while the backend fetch is in-flight.
  const inMemoryStatusCodes = useMemo(() => {
    if (!statusCol) return [];
    const seen = new Set();
    for (const r of rows || []) {
      const v = r?.[statusCol.key];
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

  // Merge backend + in-memory + currently-active code. Backend order is kept
  // (already sorted alphabetically server-side), in-memory extras are appended.
  // Local search also filters client-side so in-memory-only codes are hidden
  // when they don't match what the user typed.
  const mergedStatusCodes = useMemo(() => {
    if (!statusCol) return [];
    const seen = new Set();
    const out = [];
    for (const entry of statusDistinct.values) {
      const c = entry?.id;
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
  const [customMode, setCustomMode] = useState(false);
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  });
  const [rightMonth, setRightMonth] = useState(() => new Date());

  const handlePresetSelect = (presetId) => {
    if (!dateCol) return;
    setCustomMode(false);
    setDateMenuOpen(false);
    if (presetId === 'allTime') {
      emitDateFilter(null, null);
      return;
    }
    const range = computePresetRange(presetId);
    if (!range) return;
    emitDateFilter(range, `preset:${presetId}`);
  };

  // When the popover opens, seed both single-date pickers with the currently
  // applied range (or today/today-1month as defaults). Each picker navigates
  // independently: left = "from", right = "to".
  useEffect(() => {
    if (!dateMenuOpen) return;
    if (activeDateRange) {
      setFromDate(activeDateRange.from);
      setToDate(activeDateRange.to);
      setCustomMode(isCustomRange);
      setLeftMonth(new Date(activeDateRange.from));
      setRightMonth(new Date(activeDateRange.to));
    } else {
      setFromDate(null);
      setToDate(null);
      setCustomMode(false);
      const right = new Date();
      const left = new Date();
      left.setMonth(left.getMonth() - 1);
      setLeftMonth(left);
      setRightMonth(right);
    }
  }, [dateMenuOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFromPick = (date) => {
    setFromDate(date || null);
    setCustomMode(true);
  };
  const handleToPick = (date) => {
    setToDate(date || null);
    setCustomMode(true);
  };

  const canApplyCustom = !!(fromDate && toDate && fromDate.getTime() <= toDate.getTime());

  const handleApplyCustom = () => {
    if (!canApplyCustom) return;
    emitDateFilter(
      { from: fromDate, to: toDate },
      `custom:${toIsoDate(fromDate)}:${toIsoDate(toDate)}`,
    );
    setDateMenuOpen(false);
  };

  // Modifier used by both calendars to paint the days strictly inside the
  // selected range with a muted background.
  const inRangeModifier = useMemo(() => {
    if (!fromDate || !toDate || fromDate.getTime() >= toDate.getTime()) return null;
    const fromTs = fromDate.getTime();
    const toTs = toDate.getTime();
    return (day) => {
      const ts = day.getTime();
      return ts > fromTs && ts < toTs;
    };
  }, [fromDate, toDate]);

  const fmtDay = (d) => d.toLocaleDateString(bcpLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  const rangeSummary = (() => {
    if (fromDate && toDate) return `${fmtDay(fromDate)} – ${fmtDay(toDate)}`;
    if (fromDate) return fmtDay(fromDate);
    if (toDate) return fmtDay(toDate);
    return '';
  })();


  const hasActiveColumnFilter = Object.values(columnFilters || {}).some(Boolean);
  const hasActiveAdvancedFilter = !!advancedFilter?.conditions?.length;
  const hasActiveFilter = hasActiveColumnFilter || hasActiveAdvancedFilter;
  const hasActiveDate = !!activeDateFilter;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {statusCol && (
        <Popover open={statusMenuOpen} onOpenChange={setStatusMenuOpen}>
          <PopoverTrigger asChild>
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
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
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
            />
          </PopoverContent>
        </Popover>
      )}

      {dateCol && (
        <Popover open={dateMenuOpen} onOpenChange={setDateMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              data-testid="filter-date"
              variant="outline"
              size="sm"
              className={[
                'gap-1.5 font-normal h-9 px-3 rounded-lg bg-white',
                hasActiveDate ? 'text-foreground border-primary/40' : 'text-muted-foreground',
              ].join(' ')}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {activeDateLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <div className="flex">
              {/* Left panel — presets (193px per Figma) */}
              <div className="flex flex-col py-1 border-r border-[#E8EAEF] w-[193px]">
                {datePresets.map(preset => {
                  const active = preset.id === 'allTime' ? (!hasActiveDate && !customMode) : (activeDatePresetId === preset.id && !customMode);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset.id)}
                      className={[
                        'relative flex items-center h-8 px-2 text-sm leading-6 text-[#121217] text-left transition-colors',
                        active ? 'bg-[rgba(18,18,23,0.05)]' : 'hover:bg-[rgba(18,18,23,0.05)]',
                      ].join(' ')}
                    >
                      <span className="flex-1">{preset.label}</span>
                      {active && <Check className="h-4 w-4 shrink-0 mr-3" />}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setCustomMode(true)}
                  className={[
                    'relative flex items-center h-8 px-2 text-sm leading-6 text-[#121217] text-left transition-colors',
                    customMode ? 'bg-[rgba(18,18,23,0.05)]' : 'hover:bg-[rgba(18,18,23,0.05)]',
                  ].join(' ')}
                >
                  <span className="flex-1">{ui('dateRangeCustom')}</span>
                  {customMode && <Check className="h-4 w-4 shrink-0 mr-3" />}
                </button>
              </div>
              {/* Right panel — two calendars + footer */}
              <div className="flex flex-col">
                <div className="flex border-b border-[#E8EAEF]">
                  <CalendarWithPicker
                    month={leftMonth}
                    onMonthChange={setLeftMonth}
                    selected={fromDate ?? undefined}
                    onSelect={handleFromPick}
                    modifiers={inRangeModifier ? { inRange: inRangeModifier } : undefined}
                    modifiersClassNames={{ inRange: 'bg-[#F5F7F9] [&>button]:rounded-none' }}
                  />
                  <div className="border-l border-[#E8EAEF]" />
                  <CalendarWithPicker
                    month={rightMonth}
                    onMonthChange={setRightMonth}
                    selected={toDate ?? undefined}
                    onSelect={handleToPick}
                    modifiers={inRangeModifier ? { inRange: inRangeModifier } : undefined}
                    modifiersClassNames={{ inRange: 'bg-[#F5F7F9] [&>button]:rounded-none' }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 h-16 px-5 py-3">
                  <span className="text-sm font-medium text-[#3F3F50]">{rangeSummary}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDateMenuOpen(false)}
                      className="inline-flex items-center justify-center h-10 px-3 rounded-full bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_rgba(18,18,23,0.05)] text-sm font-medium text-[#121217] hover:bg-[rgba(18,18,23,0.05)] transition-colors"
                    >
                      {ui('dateRangeCancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCustom}
                      disabled={!canApplyCustom}
                      className="inline-flex items-center justify-center h-10 px-3 rounded-full bg-[#121217] text-sm font-medium text-white hover:bg-[#FFD500] hover:text-[#121217] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {ui('dateRangeApply')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="filter-advanced"
            title={ui('advancedFilters')}
            className="relative h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <Filter className="h-4 w-4" />
            {hasActiveAdvancedFilter && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#121217] text-white text-[10px] font-semibold leading-none">
                {advancedFilter.conditions.length}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-4">
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
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── CalendarWithPicker ─────────────────────────────────────────────────────
// Same UX as DateField: click header → picker (Mes / Año tabs) → click a
// month or year → immediately applies and returns to the days calendar.
// Each calendar in the date range filter is independent.

function FilterNavBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-6 w-6 inline-flex items-center justify-center bg-white border border-[#D1D4DB] rounded-full shadow-[0px_1px_2px_rgba(18,18,23,0.05)] hover:bg-[rgba(18,18,23,0.05)] transition-colors"
    >
      {children}
    </button>
  );
}

function CalendarWithPicker({ month, onMonthChange, selected, onSelect, modifiers, modifiersClassNames }) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const [view, setView] = useState('calendar'); // 'calendar' | 'picker'
  const [pickerTab, setPickerTab] = useState('month');
  const [yearAnchor, setYearAnchor] = useState(() => month.getFullYear());

  const localeStr = (appLocale || 'es_ES').replace('_', '-');

  const headerLabel = useMemo(
    () => new Intl.DateTimeFormat(localeStr, { month: 'long', year: 'numeric' }).format(month),
    [month, localeStr],
  );

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(localeStr, { month: 'short' });
    return Array.from({ length: 12 }, (_, i) => {
      const raw = fmt.format(new Date(2024, i, 1)).replace(/\.$/, '');
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    });
  }, [localeStr]);

  const yearItems = useMemo(() => {
    const anchor = yearAnchor - 4;
    return Array.from({ length: 12 }, (_, i) => ({ value: anchor + i, label: String(anchor + i) }));
  }, [yearAnchor]);

  const openPicker = () => {
    setYearAnchor(month.getFullYear());
    setPickerTab('month');
    setView('picker');
  };

  const navPrev = () => {
    if (view === 'calendar') {
      onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1));
    } else if (pickerTab === 'year') {
      setYearAnchor((y) => y - 12);
    } else {
      onMonthChange(new Date(month.getFullYear() - 1, month.getMonth(), 1));
    }
  };

  const navNext = () => {
    if (view === 'calendar') {
      onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1));
    } else if (pickerTab === 'year') {
      setYearAnchor((y) => y + 12);
    } else {
      onMonthChange(new Date(month.getFullYear() + 1, month.getMonth(), 1));
    }
  };

  // Clicking a month/year immediately applies and returns to the calendar —
  // no "Ok" step needed per designer spec. If a date is already selected,
  // preserve its day and only swap the month/year. If that day does not
  // exist in the target month (e.g. Mar 31 → Feb), clear the selection.
  const reselectWithSameDay = (year, monthIdx) => {
    if (!selected) return;
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const day = selected.getDate();
    onSelect?.(day <= lastDay ? new Date(year, monthIdx, day) : undefined);
  };

  const handleMonthSelect = (idx) => {
    onMonthChange(new Date(month.getFullYear(), idx, 1));
    reselectWithSameDay(month.getFullYear(), idx);
    setView('calendar');
  };

  const handleYearSelect = (year) => {
    onMonthChange(new Date(year, month.getMonth(), 1));
    reselectWithSameDay(year, month.getMonth());
    setView('calendar');
  };

  return (
    // Fixed width keeps both views (calendar / picker) occupying the same
    // horizontal footprint so the panel does not resize when the user
    // switches into the month/year selector.
    <div className="w-[244px]">
      {/* Header row: label (clickable) + nav arrows */}
      <div className="flex items-center justify-between h-8 px-2">
        <button
          type="button"
          onClick={view === 'calendar' ? openPicker : () => setView('calendar')}
          className="inline-flex items-center gap-2 px-2 py-1 rounded-md text-sm font-medium text-[#121217] hover:bg-[rgba(18,18,23,0.05)] capitalize"
        >
          <span>{headerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-[#6B7280]" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <FilterNavBtn onClick={navPrev}>
            <ChevronLeft className="h-4 w-4 text-[#828FA3]" aria-hidden="true" />
          </FilterNavBtn>
          <FilterNavBtn onClick={navNext}>
            <ChevronRight className="h-4 w-4 text-[#828FA3]" aria-hidden="true" />
          </FilterNavBtn>
        </div>
      </div>

      {/* min-h matches the natural calendar height (weekdays + 6 weeks)
          so the picker view does not collapse vertically. */}
      <div className="min-h-[244px]">
      {view === 'calendar' ? (
        <Calendar
          mode="single"
          month={month}
          onMonthChange={onMonthChange}
          selected={selected}
          onSelect={onSelect}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          hideNavigation
          className="p-0 pt-1"
          classNames={{
            month_caption: 'hidden',
            nav: 'hidden',
            week: 'flex justify-center',
            weekdays: 'flex justify-center py-2',
          }}
        />
      ) : (
        <div className="pt-1 px-2 space-y-2">
          {/* Tabs — Mes / Año */}
          <div className="flex h-10 p-1 gap-1 bg-[#F5F7F9] rounded-xl">
            {[
              { key: 'month', label: ui('datePickerMonth') },
              { key: 'year',  label: ui('datePickerYear') },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPickerTab(tab.key)}
                className={cn(
                  'flex-1 h-8 px-2 rounded-lg text-sm font-medium transition-colors',
                  pickerTab === tab.key
                    ? 'bg-white text-[#121217] shadow-[0px_1px_3px_rgba(18,18,23,0.1),0px_1px_2px_rgba(18,18,23,0.06)]'
                    : 'text-[#121217] hover:bg-[rgba(18,18,23,0.05)]',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Month / Year grid */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {(pickerTab === 'month'
              ? monthNames.map((label, i) => ({ value: i, label }))
              : yearItems
            ).map((item) => {
              const isSelected = pickerTab === 'month'
                ? item.value === month.getMonth()
                : item.value === month.getFullYear();
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() =>
                    pickerTab === 'month'
                      ? handleMonthSelect(item.value)
                      : handleYearSelect(item.value)
                  }
                  className={cn(
                    'h-8 px-2 rounded-lg text-sm font-medium transition-colors',
                    isSelected
                      ? 'bg-[#121217] text-white hover:bg-[#FFD500] hover:text-[#121217]'
                      : 'text-[#121217] hover:bg-[rgba(18,18,23,0.05)]',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="pb-2" />
        </div>
      )}
      </div>
    </div>
  );
}

export default ListFilterBar;
