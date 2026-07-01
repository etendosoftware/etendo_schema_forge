import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';

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
      <div className="flex w-[193px] flex-col border-r border-[#E8EAEF] py-1">
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
                'relative flex h-8 items-center px-2 text-left text-sm leading-6 text-[#121217] transition-colors',
                active ? 'bg-[rgba(18,18,23,0.05)]' : 'hover:bg-[rgba(18,18,23,0.05)]',
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
            'relative flex h-8 items-center px-2 text-left text-sm leading-6 text-[#121217] transition-colors',
            customMode ? 'bg-[rgba(18,18,23,0.05)]' : 'hover:bg-[rgba(18,18,23,0.05)]',
          )}
        >
          <span className="flex-1">{ui('dateRangeCustom')}</span>
          {customMode ? <Check className="mr-3 h-4 w-4 shrink-0" data-testid="Check__482ed1" /> : null}
        </button>
      </div>
      {/* Calendars + footer */}
      <div className="flex flex-col">
        <div className="flex border-b border-[#E8EAEF]">
          <CalendarWithPicker
            month={leftMonth}
            onMonthChange={setLeftMonth}
            selected={fromDate ?? undefined}
            onSelect={(d) => { setFromDate(d || null); setCustomMode(true); }}
            modifiers={inRangeModifier ? { inRange: inRangeModifier } : undefined}
            modifiersClassNames={{ inRange: 'bg-[#F5F7F9] [&>button]:rounded-none' }}
            data-testid="CalendarWithPicker__482ed1" />
          <div className="border-l border-[#E8EAEF]" />
          <CalendarWithPicker
            month={rightMonth}
            onMonthChange={setRightMonth}
            selected={toDate ?? undefined}
            onSelect={(d) => { setToDate(d || null); setCustomMode(true); }}
            modifiers={inRangeModifier ? { inRange: inRangeModifier } : undefined}
            modifiersClassNames={{ inRange: 'bg-[#F5F7F9] [&>button]:rounded-none' }}
            data-testid="CalendarWithPicker__482ed1" />
        </div>
        <div className="flex h-16 items-center justify-between gap-2 px-5 py-3">
          <span className="text-sm font-medium text-[#3F3F50]">{rangeSummary}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#D1D4DB] bg-white px-3 text-sm font-medium text-[#121217] shadow-[0px_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-[rgba(18,18,23,0.05)]"
            >
              {ui('dateRangeCancel')}
            </button>
            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!canApplyCustom}
              className="inline-flex h-10 items-center justify-center rounded-full bg-[#121217] px-3 text-sm font-medium text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217] disabled:cursor-not-allowed disabled:opacity-40"
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
          className="inline-flex h-9 items-center justify-between gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-normal leading-6 text-muted-foreground transition-colors hover:bg-[#F5F7F9]"
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
// CalendarWithPicker (extracted verbatim from ListFilterBar)
// ─────────────────────────────────────────────────────────────────────────────

function FilterNavBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#D1D4DB] bg-white shadow-[0px_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-[rgba(18,18,23,0.05)]"
    >
      {children}
    </button>
  );
}

function CalendarWithPicker({ month, onMonthChange, selected, onSelect, modifiers, modifiersClassNames }) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const [view, setView] = useState('calendar');
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
      <div className="flex h-8 items-center justify-between px-2">
        <button
          type="button"
          onClick={view === 'calendar' ? openPicker : () => setView('calendar')}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium capitalize text-[#121217] hover:bg-[rgba(18,18,23,0.05)]"
        >
          <span>{headerLabel}</span>
          <ChevronDown
            className="h-3.5 w-3.5 text-[#6B7280]"
            aria-hidden="true"
            data-testid="ChevronDown__482ed1" />
        </button>
        <div className="flex items-center gap-2">
          <FilterNavBtn onClick={navPrev} data-testid="FilterNavBtn__482ed1">
            <ChevronLeft
              className="h-4 w-4 text-[#828FA3]"
              aria-hidden="true"
              data-testid="ChevronLeft__482ed1" />
          </FilterNavBtn>
          <FilterNavBtn onClick={navNext} data-testid="FilterNavBtn__482ed1">
            <ChevronRight
              className="h-4 w-4 text-[#828FA3]"
              aria-hidden="true"
              data-testid="ChevronRight__482ed1" />
          </FilterNavBtn>
        </div>
      </div>
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
          <div className="space-y-2 px-2 pt-1">
            <div className="flex h-10 gap-1 rounded-xl bg-[#F5F7F9] p-1">
              {[
                { key: 'month', label: ui('datePickerMonth') },
                { key: 'year',  label: ui('datePickerYear') },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPickerTab(tab.key)}
                  className={cn(
                    'h-8 flex-1 rounded-lg px-2 text-sm font-medium transition-colors',
                    pickerTab === tab.key
                      ? 'bg-white text-[#121217] shadow-[0px_1px_3px_rgba(18,18,23,0.1),0px_1px_2px_rgba(18,18,23,0.06)]'
                      : 'text-[#121217] hover:bg-[rgba(18,18,23,0.05)]',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

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
                      'h-8 rounded-lg px-2 text-sm font-medium transition-colors',
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
