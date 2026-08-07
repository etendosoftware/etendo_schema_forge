import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
// Shared month/year-picker chrome (ETP-4771) — the same HeaderRow/PickerTabs/
// PickerGrid used by the conditional-filter date picker (DateField), so both
// pickers render identical UI instead of two independently drifting
// reimplementations.
import { HeaderRow, PickerTabs, PickerGrid } from '@etendosoftware/app-shell-core/components/ui/date-picker-chrome.jsx';
// Same header-label formatter DateField uses (ETP-4771) — Intl's combined
// { month: 'long', year: 'numeric' } format inserts the "de" preposition in
// es-ES ("agosto de 2026"). formatMonthYearLabel formats month/year
// separately and joins with a plain space ("Agosto 2026"), so both pickers
// show identical header text.
import { formatMonthYearLabel } from '@etendosoftware/app-shell-core/lib/dateMask.js';

/**
 * value shape used by both DateRangePopover and DateRangePopoverContent:
 *   - null                                  → All time (no constraint)
 *   - { presetId: 'today'|'yesterday'|'last7'|'last30'|'last12m' }
 *   - { from: Date, to: Date }              → Custom range
 */

// ─────────────────────────────────────────────────────────────────────────────
// Inner content: presets list + dual calendar + footer.
// Does NOT manage its own popover state — the parent controls it via `onClose`.
// Re-mounts each time the popover opens, so internal drafts start fresh.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   value: null | { presetId: string } | { from: Date, to: Date };
 *   onChange: (v: null | { presetId: string } | { from: Date, to: Date }) => void;
 *   onClose: () => void;
 * }} props
 */
export function DateRangePopoverContent({ value, onChange, onClose }) {
  const ui = useUI();

  const datePresets = useMemo(() => ([
    { id: 'today',     label: ui('dateRangeToday') },
    { id: 'yesterday', label: ui('dateRangeYesterday') },
    { id: 'last7',     label: ui('dateRangeLast7Days') },
    { id: 'last30',    label: ui('dateRangeLast30Days') },
    { id: 'last12m',   label: ui('dateRangeLast12Months') },
    { id: 'allTime',   label: ui('dateRangeAllTime') },
  ]), [ui]);

  const activePresetId = value && 'presetId' in value ? value.presetId : null;
  const isCustom = !!value && 'from' in value && 'to' in value;
  const hasActiveValue = !!value;

  // Drafts seeded from `value` once at mount (content remounts when popover reopens)
  const [customMode, setCustomMode] = useState(isCustom);
  const [fromDate, setFromDate] = useState(isCustom ? value.from : null);
  const [toDate, setToDate] = useState(isCustom ? value.to : null);
  const [leftMonth, setLeftMonth] = useState(() =>
    isCustom ? new Date(value.from) : (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; })(),
  );
  const [rightMonth, setRightMonth] = useState(() => (isCustom ? new Date(value.to) : new Date()));

  const handlePresetSelect = (presetId) => {
    setCustomMode(false);
    if (presetId === 'allTime') onChange?.(null);
    else onChange?.({ presetId });
    onClose?.();
  };

  const canApplyCustom = !!(fromDate && toDate && fromDate.getTime() <= toDate.getTime());

  const handleApplyCustom = () => {
    if (!canApplyCustom) return;
    onChange?.({ from: fromDate, to: toDate });
    onClose?.();
  };

  const inRangeModifier = useMemo(() => {
    if (!fromDate || !toDate || fromDate.getTime() >= toDate.getTime()) return null;
    const fromTs = fromDate.getTime();
    const toTs = toDate.getTime();
    return (day) => {
      const ts = day.getTime();
      return ts > fromTs && ts < toTs;
    };
  }, [fromDate, toDate]);

  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const fmtDay = (d) =>
    d.toLocaleDateString(bcpLocale, { day: 'numeric', month: 'short', year: 'numeric' });

  const rangeSummary = (() => {
    if (fromDate && toDate) return `${fmtDay(fromDate)} – ${fmtDay(toDate)}`;
    if (fromDate) return fmtDay(fromDate);
    if (toDate) return fmtDay(toDate);
    return '';
  })();

  return (
    <div className="flex">
      {/* Preset list */}
      <div className="flex w-[193px] flex-col border-r border-border-subtle py-1">
        {datePresets.map((preset) => {
          const active =
            preset.id === 'allTime'
              ? (!hasActiveValue && !customMode)
              : (activePresetId === preset.id && !customMode);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetSelect(preset.id)}
              className={cn(
                'relative flex h-8 items-center px-2 text-left text-sm leading-6 text-foreground transition-colors',
                active ? 'bg-muted' : 'hover:bg-muted',
              )}
            >
              <span className="flex-1">{preset.label}</span>
              {active ? <Check className="mr-3 h-4 w-4 shrink-0" data-testid="Check__482ed1" /> : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomMode(true)}
          className={cn(
            'relative flex h-8 items-center px-2 text-left text-sm leading-6 text-foreground transition-colors',
            customMode ? 'bg-muted' : 'hover:bg-muted',
          )}
        >
          <span className="flex-1">{ui('dateRangeCustom')}</span>
          {customMode ? <Check className="mr-3 h-4 w-4 shrink-0" data-testid="Check__482ed1" /> : null}
        </button>
      </div>
      {/* Calendars + footer */}
      <div className="flex flex-col">
        <div className="flex border-b border-border-subtle">
          <CalendarWithPicker
            month={leftMonth}
            onMonthChange={setLeftMonth}
            selected={fromDate ?? undefined}
            onSelect={(d) => { setFromDate(d || null); setCustomMode(true); }}
            modifiers={inRangeModifier ? { inRange: inRangeModifier } : undefined}
            modifiersClassNames={{ inRange: 'bg-muted [&>button]:rounded-none' }}
            data-testid="CalendarWithPicker__482ed1" />
          <div className="border-l border-border-subtle" />
          <CalendarWithPicker
            month={rightMonth}
            onMonthChange={setRightMonth}
            selected={toDate ?? undefined}
            onSelect={(d) => { setToDate(d || null); setCustomMode(true); }}
            modifiers={inRangeModifier ? { inRange: inRangeModifier } : undefined}
            modifiersClassNames={{ inRange: 'bg-muted [&>button]:rounded-none' }}
            data-testid="CalendarWithPicker__482ed1" />
        </div>
        <div className="flex h-16 items-center justify-between gap-2 px-5 py-3">
          <span className="text-sm font-medium text-muted-foreground">{rangeSummary}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border-control bg-card px-3 text-sm font-medium text-foreground shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] transition-colors hover:bg-muted"
            >
              {ui('dateRangeCancel')}
            </button>
            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!canApplyCustom}
              className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-highlight hover:text-accent-highlight-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ui('dateRangeApply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public wrapper: Popover + default trigger + DateRangePopoverContent.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standalone date-range popover with preset list + dual-month custom calendar.
 *
 * @param {{
 *   value: null | { presetId: string } | { from: Date, to: Date };
 *   onChange: (v: null | { presetId: string } | { from: Date, to: Date }) => void;
 *   placeholder?: string;
 * }} props
 */
export function DateRangePopover({ value, onChange, placeholder }) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const [open, setOpen] = useState(false);

  const triggerLabel = computeTriggerLabel(value, placeholder, ui, bcpLocale);

  return (
    <Popover open={open} onOpenChange={setOpen} data-testid="Popover__482ed1">
      <PopoverTrigger asChild data-testid="PopoverTrigger__482ed1">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-between gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-normal leading-6 text-muted-foreground transition-colors hover:bg-muted"
        >
          <CalendarDays
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            data-testid="CalendarDays__482ed1" />
          <span className="mx-1 truncate text-left">{triggerLabel}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            data-testid="ChevronDown__482ed1" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0" data-testid="PopoverContent__482ed1">
        <DateRangePopoverContent
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          data-testid="DateRangePopoverContent__482ed1" />
      </PopoverContent>
    </Popover>
  );
}

// Shared label resolver — exported so consumers with custom triggers can reuse it.
export function computeTriggerLabel(value, placeholder, ui, bcpLocale) {
  const fmtDay = (d) =>
    d.toLocaleDateString(bcpLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  if (value && 'presetId' in value) {
    const labels = {
      today: ui('dateRangeToday'),
      yesterday: ui('dateRangeYesterday'),
      last7: ui('dateRangeLast7Days'),
      last30: ui('dateRangeLast30Days'),
      last12m: ui('dateRangeLast12Months'),
    };
    return labels[value.presetId] ?? placeholder ?? ui('dateRangeAnyTime');
  }
  if (value && 'from' in value && 'to' in value) {
    return `${fmtDay(value.from)} – ${fmtDay(value.to)}`;
  }
  return placeholder ?? ui('dateRangeAnyTime');
}

// ─────────────────────────────────────────────────────────────────────────────
// CalendarWithPicker — day-grid calendar with a month/year picker overlay.
//
// The header (month/year label + prev/next nav) and the picker overlay
// (Mes/Año tabs + 3-column grid) are the shared date-picker-chrome pieces
// (ETP-4771) — the exact same HeaderRow/PickerTabs/PickerGrid the
// conditional-filter date picker (DateField) uses, so both calendars render
// identical chrome. Only the day-grid `Calendar` itself (dual-month range
// selection with an `inRange` modifier) is specific to this component.
// ─────────────────────────────────────────────────────────────────────────────

function CalendarWithPicker({ month, onMonthChange, selected, onSelect, modifiers, modifiersClassNames }) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const [view, setView] = useState('calendar');
  const [pickerTab, setPickerTab] = useState('month');
  const [yearAnchor, setYearAnchor] = useState(() => month.getFullYear());

  const localeStr = (appLocale || 'es_ES').replace('_', '-');

  const headerLabel = useMemo(
    () => formatMonthYearLabel(month, localeStr),
    [month, localeStr],
  );

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(localeStr, { month: 'short' });
    return Array.from({ length: 12 }, (_, i) => {
      const raw = fmt.format(new Date(2024, i, 1)).replace(/\.$/, '');
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    });
  }, [localeStr]);

  const monthItems = useMemo(
    () => monthNames.map((label, i) => ({ value: i, label })),
    [monthNames],
  );

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
    <div className="w-[244px]">
      <HeaderRow
        label={headerLabel}
        onLabelClick={view === 'calendar' ? openPicker : () => setView('calendar')}
        onPrev={navPrev}
        onNext={navNext}
        showLabelChevron={view === 'calendar'}
        data-testid="HeaderRow__482ed1" />
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
            data-testid="Calendar__482ed1" />
        ) : (
          <div className="pt-1 space-y-2 px-2">
            <PickerTabs
              active={pickerTab}
              onChange={setPickerTab}
              monthLabel={ui('datePickerMonth')}
              yearLabel={ui('datePickerYear')}
              data-testid="PickerTabs__482ed1" />
            {pickerTab === 'month' ? (
              <PickerGrid
                items={monthItems}
                selectedValue={month.getMonth()}
                onSelect={handleMonthSelect}
                data-testid="PickerGrid__482ed1" />
            ) : (
              <PickerGrid
                items={yearItems}
                selectedValue={month.getFullYear()}
                onSelect={handleYearSelect}
                data-testid="PickerGrid__482ed1" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
