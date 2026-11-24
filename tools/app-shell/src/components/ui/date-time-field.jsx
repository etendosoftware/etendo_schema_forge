import * as React from 'react';
import { CalendarBlankIcon as CalendarIcon } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { FIELD_HEIGHT } from '@/components/ui/formDensity';
// Same header and footer chrome as DateField / DateRangePopover (ETP-4771), so the three pickers
// render identical UI.
import { HeaderRow, PillButton } from '@etendosoftware/app-shell-core/components/ui/date-picker-chrome.jsx';
import { getDatePattern, formatMonthYearLabel } from '@etendosoftware/app-shell-core/lib/dateMask.js';
import { parseCalendarDate } from '@/lib/dateOnly.js';
import { useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  splitWallClock, joinWallClock, formatDateTimeText, maskDateTimeInput, parseDateTimeText,
  isAfterMax, localNowWallClock, buildDateTimePlaceholder,
} from './date-time-field-model.js';

function intlLocale(appLocale) {
  return (appLocale || 'en-GB').replace('_', '-');
}

/**
 * DateTimeField — ONE field for a date and a time (ETP-6365), the date-time sibling of the shared
 * `DateField` (app-shell-core `components/ui/date-field.jsx`), built on the same pieces (field
 * shell, calendar icon trigger, `Popover`, `Calendar`, `HeaderRow` / `PillButton` chrome), so both
 * look the same: height, border, focus ring, hover, disabled look.
 *
 * Value: a WALL-CLOCK string `yyyy-MM-ddTHH:mm` (`:ss` accepted on input; output is always
 * `yyyy-MM-ddTHH:mm:00`), never converted through `Date`/UTC — the NeoDateFormat convention.
 * Shown as `<locale date> HH:mm` (`19/11/2026 14:20` in es-ES).
 *
 * - Typing: digits only, the separators are inserted (`191120261420` → `19/11/2026 14:20`);
 *   committed on blur or Enter (Enter does not submit a surrounding form, as in DateField). An
 *   empty field commits `''`; text that is not a real day and a 24h time keeps the field in error
 *   (`aria-invalid`) and commits `null`. Esc restores the committed text.
 * - Popover (calendar icon): the calendar picks the day and keeps the current time; the time
 *   input in the popover sets the time; "Ahora" sets `max` (or the browser's minute) and "Limpiar"
 *   empties it. Esc closes it.
 * - `max`: days after it are disabled in the calendar, and a value later than it is flagged
 *   (`aria-invalid`) — never clamped; the host decides what to say.
 * - `readOnly`: the disabled-looking shell, no popover; an empty value shows `placeholder` (e.g.
 *   "— (sin fecha de fin)").
 *
 * @param {object} props
 * @param {string|null} [props.value] wall-clock value
 * @param {(value: string|null) => void} [props.onChange] `''` cleared, `null` invalid text
 * @param {() => void} [props.onBlur]
 * @param {string} [props.placeholder] defaults to the locale hint (`dd/mm/aaaa hh:mm`)
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.readOnly]
 * @param {boolean} [props.invalid] forces the error look (same as `aria-invalid`)
 * @param {string} [props.max] wall-clock upper bound
 * @param {boolean} [props.required]
 * @param {string} [props.id]
 * @param {string} [props.name]
 * @param {string} [props.className] appended to the field shell
 * @param {string} [props['aria-label']]
 * @param {string} [props['data-testid']] put on the text input; the popover parts derive from it
 */
export function DateTimeField({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled = false,
  readOnly = false,
  invalid = false,
  max,
  required,
  id,
  name,
  className,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'data-testid': dataTestId = 'date-time-field',
}) {
  const { locale: appLocale } = useLocaleSwitch();
  const ui = useUI();
  const localeStr = intlLocale(appLocale);
  const pattern = React.useMemo(() => getDatePattern(localeStr), [localeStr]);
  const defaultPlaceholder = React.useMemo(() => buildDateTimePlaceholder(pattern, localeStr), [pattern, localeStr]);
  const locked = disabled || readOnly;

  const parts = splitWallClock(value);
  const formattedValue = formatDateTimeText(value, pattern);
  const [inputText, setInputText] = React.useState(formattedValue);
  const [isFocused, setIsFocused] = React.useState(false);
  const [typedInvalid, setTypedInvalid] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [displayedMonth, setDisplayedMonth] = React.useState(
    () => parseCalendarDate(parts?.date) || parseCalendarDate(splitWallClock(max)?.date) || new Date(),
  );

  // Follow the value from outside while the user is not typing. Text the user typed that is not a
  // real date and time stays, flagged, after blur as after Enter: until they correct it or a new
  // non-empty value arrives from props (the `null` it committed itself is not one).
  const lastFormatted = React.useRef(formattedValue);
  React.useEffect(() => {
    const arrived = lastFormatted.current !== formattedValue;
    lastFormatted.current = formattedValue;
    if (isFocused) return;
    if (typedInvalid && (!arrived || !formattedValue)) return;
    setInputText(formattedValue);
    setTypedInvalid(false);
  }, [formattedValue, isFocused, typedInvalid]);
  React.useEffect(() => {
    const day = parseCalendarDate(parts?.date);
    if (day) setDisplayedMonth(day);
  }, [parts?.date]);

  const showInvalid = Boolean(invalid || ariaInvalid === true || ariaInvalid === 'true'
    || typedInvalid || (value && max && isAfterMax(value, max)));

  const commit = (next) => {
    if ((next ?? null) !== (value ?? null)) onChange?.(next);
  };

  const commitTyped = () => {
    const parsed = parseDateTimeText(inputText, pattern);
    if (!parsed.ok) {
      setTypedInvalid(true);
      commit(null);
      return;
    }
    setTypedInvalid(false);
    commit(parsed.value);
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitTyped();
    onBlur?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTyped();
    } else if (e.key === 'Escape') {
      // Restores the committed text (a surrounding dialog still handles its own Esc).
      setInputText(formattedValue);
      setTypedInvalid(false);
    }
  };

  const nowValue = max || localNowWallClock();
  const currentTime = parts?.time ?? splitWallClock(nowValue)?.time ?? '00:00';

  const selectDay = (date) => {
    if (!date) return;
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setTypedInvalid(false);
    commit(joinWallClock(iso, currentTime));
  };

  const setTime = (time) => {
    const day = parts?.date ?? splitWallClock(nowValue)?.date;
    const next = joinWallClock(day, time);
    if (next) {
      setTypedInvalid(false);
      commit(next);
    }
  };

  const maxDay = parseCalendarDate(splitWallClock(max)?.date);
  const testId = dataTestId;

  const wrapperClass = cn(
    `flex items-center gap-2 ${FIELD_HEIGHT} w-full min-w-0 rounded-lg border border-[hsl(var(--border-control))] bg-card px-2`,
    'shadow-[0px_1px_2px_rgba(18,18,23,0.05)]',
    locked
      ? 'cursor-not-allowed bg-[hsl(var(--field-hover))] border-[hsl(var(--field-disabled-border))] text-text-disabled'
      : 'hover:bg-[hsl(var(--field-hover))] focus-within:outline-none focus-within:ring-2 focus-within:ring-focus-ring',
    showInvalid && 'border-destructive',
    className,
  );

  let shownPlaceholder = '';
  if (readOnly) shownPlaceholder = placeholder ?? '';
  else if (isFocused) shownPlaceholder = placeholder || defaultPlaceholder;

  return (
    <Popover open={open && !locked} onOpenChange={(next) => { if (!locked) setOpen(next); }} data-testid={`${testId}-popover`}>
      <div className={wrapperClass} data-invalid={showInvalid ? 'true' : undefined}>
        <PopoverTrigger asChild data-testid={`${testId}-trigger-wrap`}>
          <button
            type="button"
            disabled={locked}
            aria-label={ui('datePickerOpen')}
            className={cn(
              'inline-flex items-center justify-center shrink-0 rounded',
              !locked && 'hover:bg-[rgba(18,18,23,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            data-testid={`${testId}-trigger`}>
            <CalendarIcon className="h-6 w-6 shrink-0 text-[#A9A9BC]" aria-hidden="true" data-testid={`${testId}-icon`} />
          </button>
        </PopoverTrigger>
        <input
          type="text"
          id={id}
          name={name}
          data-testid={testId}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-label={ariaLabel}
          aria-invalid={showInvalid ? true : undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder={shownPlaceholder}
          value={inputText}
          onChange={(e) => setInputText(maskDateTimeInput(e.target.value, pattern))}
          maxLength={16}
          onFocus={() => setIsFocused(true)}
          onBlur={readOnly ? undefined : handleBlur}
          onKeyDown={readOnly ? undefined : handleKeyDown}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm leading-6 font-normal text-text-primary tabular-nums placeholder:text-text-secondary disabled:cursor-not-allowed disabled:text-text-disabled read-only:cursor-default" />
      </div>
      {!locked && (
        <PopoverContent className="w-[264px] p-0" align="start" data-testid={`${testId}-content`}>
          <div className="p-2">
            <HeaderRow
              label={formatMonthYearLabel(displayedMonth, localeStr)}
              onLabelClick={() => {}}
              onPrev={() => setDisplayedMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              onNext={() => setDisplayedMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              showLabelChevron={false}
              data-testid={`${testId}-header`} />
            <Calendar
              mode="single"
              selected={parseCalendarDate(parts?.date) || undefined}
              onSelect={selectDay}
              disabled={maxDay ? { after: maxDay } : undefined}
              month={displayedMonth}
              onMonthChange={setDisplayedMonth}
              hideNavigation
              className="p-0 pt-1"
              classNames={{
                month_caption: 'hidden',
                nav: 'hidden',
                day_button:
                  'h-8 w-8 p-0 font-normal text-[#121217] rounded-full hover:bg-[rgba(18,18,23,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                today: '[&>button]:border [&>button]:border-[#282833] [&>button]:text-[#282833]',
              }}
              data-testid={`${testId}-calendar`} />
            <label className="mt-2 flex items-center justify-between gap-2 px-2 text-sm text-text-primary">
              <span>{ui('dateTimeFieldTime')}</span>
              <Input
                type="time"
                value={currentTime}
                onChange={(e) => setTime(e.target.value)}
                aria-label={ui('dateTimeFieldTime')}
                className="w-[110px] bg-card"
                data-testid={`${testId}-time`} />
            </label>
          </div>
          <div className="border-t border-[#E8EAEF] flex items-center justify-between gap-2 px-5 py-3">
            <PillButton onClick={() => { commit(''); setOpen(false); }} disabled={!value} data-testid={`${testId}-clear`}>
              {ui('clear')}
            </PillButton>
            <PillButton
              variant="filled"
              onClick={() => { setTypedInvalid(false); commit(joinWallClock(splitWallClock(nowValue).date, splitWallClock(nowValue).time)); setOpen(false); }}
              data-testid={`${testId}-now`}>
              {ui('dateTimeFieldNow')}
            </PillButton>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

export default DateTimeField;
