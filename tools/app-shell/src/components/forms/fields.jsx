// Form field primitives that WRAP the shared UI components used by the Sales
// Order detail form (EntityForm), so wizard/modal inputs, selects and date
// pickers look and behave identically across the app. Shared by the New
// Movement wizard and the generic Payment form.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { useUI } from '@/i18n';
import { Label as UiLabel } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { SelectorChip } from '@/components/contract-ui/SelectorChip.jsx';
import { FIELD_HEIGHT } from '@/components/ui/formDensity';
import { formatCurrency, getCurrencySymbol, formatPlainDecimal } from '@/lib/formatCurrency.js';
import { getCurrencyFormatConfig, isCurrencySymbolRightSide } from '@/lib/currencyFormatConfig.js';
import { parseLocaleNumber } from '@/lib/parseLocaleNumber.js';
import { parseAmountInput } from '@/lib/parseAmountInput.js';
import {
  Select as RSelect, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export function Field({ label, required, className = '', children }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label ? (
        <UiLabel
          className="text-sm font-medium text-foreground"
          data-testid="UiLabel__7183e9">
          {label}{required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </UiLabel>
      ) : null}
      {children}
    </div>
  );
}

/** Read-only display — the disabled base Input, consistent with the form fields. */
export function ReadOnly({ children }) {
  const text = Array.isArray(children) ? children.join('') : (children ?? '');
  return <Input disabled readOnly value={text} data-testid="Input__7183e9" />;
}

export function TextInput({ className = '', name, ...rest }) {
  // White background: these are editable; the app's default Input is grey, which
  // reads as read-only. Caller className can still override.
  return <Input className={`bg-card ${className}`} name={name} {...rest} data-testid={name ? `field-text-${name}` : 'field-text'} />;
}

/**
 * Enum select. `onChange` receives the selected value (string), matching the
 * Radix Select contract used across the app.
 */
export function Select({ label, required, value, onChange, options, placeholder, className, name }) {
  // Accept options as plain strings or as { id, name } / { value, label } objects.
  const items = (options || []).map((o) =>
    (typeof o === 'string' ? { value: o, label: o } : { value: o.id ?? o.value, label: o.name ?? o.label }));
  return (
    <Field
      label={label}
      required={required}
      className={className}
      data-testid="Field__7183e9">
      <RSelect
        value={value ?? ''}
        onValueChange={onChange}
        data-testid="RSelect__7183e9">
        <SelectTrigger
          className="focus:ring-2 focus:ring-primary"
          data-testid={name ? `field-select-${name}` : 'SelectTrigger__7183e9'}>
          <SelectValue
            placeholder={placeholder || 'Seleccionar…'}
            data-testid="SelectValue__7183e9" />
        </SelectTrigger>
        <SelectContent data-testid="SelectContent__7183e9">
          {items.map((it) => <SelectItem key={it.value} value={it.value} data-testid="SelectItem__7183e9">{it.label}</SelectItem>)}
        </SelectContent>
      </RSelect>
    </Field>
  );
}

/** Date field. `value` is an ISO date (yyyy-mm-dd); `onChange` emits the same. */
export function DateInput({ label, required, value, onChange, className, name, disabled }) {
  return (
    <Field
      label={label}
      required={required}
      className={className}
      data-testid="Field__7183e9">
      <DateField value={value} onChange={onChange} disabled={disabled} data-testid={name ? `field-date-${name}` : 'DateField__7183e9'} />
    </Field>
  );
}

/**
 * Bare money/numeric input that keeps what the user types verbatim while
 * focused, so a parent that re-formats `value` on every change (e.g.
 * eur(parseEur(x))) doesn't fight the keystrokes. On blur it shows the formatted
 * `value`. Same UX as the Sales Order line amount fields. Unstyled — pass a
 * `className` for table-cell / inline use.
 */
export function MoneyInput({ value, onChange, className = '', disabled, placeholder, name }) {
  const [buffer, setBuffer] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setBuffer(value); }, [value, focused]);
  return (
    <input
      className={className}
      value={focused ? buffer : value}
      onChange={(e) => { setBuffer(e.target.value); onChange?.(e); }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      placeholder={placeholder}
      data-testid={name ? `field-number-${name}` : 'field-number'}
    />
  );
}

export function AmountInput({ label, required, value, onChange, onBlur, placeholder, readOnly, className, name, currency }) {
  // Keep what the user types verbatim while the field is focused, so a parent
  // that re-formats `value` on every change (e.g. eur(parseEur(x))) doesn't
  // fight the keystrokes. On blur we fall back to the formatted `value` and run
  // the optional `onBlur` (parents use it to normalize, e.g. "20" → "20,00").
  const [buffer, setBuffer] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setBuffer(value); }, [value, focused]);

  // ETP-4314 follow-up: the symbol side (left for USD/GBP/etc., right for EUR)
  // isn't hardcoded — read from C_CURRENCY.ISSYMBOLRIGHTSIDE via
  // isCurrencySymbolRightSide(), same source formatCurrency() uses for the
  // read-only display of this same amount elsewhere in the app.
  const rightSide = isCurrencySymbolRightSide(currency);

  return (
    <Field
      label={label}
      required={required}
      className={className}
      data-testid="Field__7183e9">
      <div className="relative">
        <Input
          className={`${rightSide ? 'pr-8' : 'pl-8'} text-right tabular-nums ${readOnly ? '' : 'bg-card'}`}
          value={focused ? buffer : value}
          onChange={(e) => { setBuffer(e.target.value); onChange?.(e); }}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          placeholder={placeholder}
          disabled={readOnly}
          data-testid={name ? `field-number-${name}` : 'field-number'} />
        <span
          className={`pointer-events-none absolute ${rightSide ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted-foreground`}>
          {getCurrencySymbol(currency) || '€'}
        </span>
      </div>
    </Field>
  );
}

// ─── MaskedAmountInput internals (ETP-5107) ───────────────────────────────
// The canonical masked money input, and the one every EDITABLE amount field in
// the app must use. See
// docs/plans/2026-09-13-etp5107-experimental-server-verification.md §7.12 for
// the migration and the rule that goes with it: once a field renders this
// component its value is CLEAN, so it must be read back with parseLocaleNumber,
// never with a structural/grouping-aware parser.
//
// AmountInput and MoneyInput above are the deliberate exception, and NOT a
// migration that was forgotten. Their only editable consumer is PaymentForm,
// which is reachable solely through NewMovementWizard — dead since ETP-4500
// (2026-07-15) replaced it with NewTransactionModal. AmountInput's one live
// caller, ReversedInvoicesPanel, passes no `onChange` and is display-only.
// Migrating them would have changed only unreachable code, so they were left
// exactly as they were. If NewMovementWizard is ever revived, they are the
// first thing to move onto this component.

function countSignificantChars(str, thousandsSeparator) {
  if (!thousandsSeparator) return str.length;
  let count = 0;
  for (const ch of str) if (ch !== thousandsSeparator) count += 1;
  return count;
}

function positionAfterSignificant(str, sigCount, thousandsSeparator) {
  if (!thousandsSeparator) return Math.min(sigCount, str.length);
  let seen = 0;
  for (let i = 0; i < str.length; i += 1) {
    if (seen >= sigCount) return i;
    if (str[i] !== thousandsSeparator) seen += 1;
  }
  return str.length;
}

/**
 * Filters a raw (possibly already-grouped) DOM value down to the characters
 * the user is allowed to have typed: digits, an optional leading '-', and at
 * MOST one decimal separator — always recomputed from scratch (never
 * incrementally patched), so there is no "keystroke silently rejected but
 * typing continues from stale state" failure mode (the exact silent-comma-
 * drop bug this fix closes — plan §5.1/§6.2). The thousands separator is
 * dropped unconditionally; it is never real user input.
 *
 * When `strictDecimal` is true (grouping on — Holded's rule), ONLY the one
 * configured `decimalSeparator` is accepted as the decimal char, since '.'
 * would otherwise be ambiguous with a live thousands separator. When false
 * (grouping off — quantity/integer/number/decimal/percent fields), BOTH ','
 * and '.' are accepted as equivalent, matching what `parseLocaleNumber()`
 * itself always accepts (plan §6.1) — this also fixes Bug 1 for these types.
 */
function filterMaskChars(raw, decimalSeparator, strictDecimal) {
  let acceptedDecimalChars;
  if (strictDecimal) {
    acceptedDecimalChars = [decimalSeparator];
  } else if (decimalSeparator === '.') {
    acceptedDecimalChars = ['.'];
  } else {
    acceptedDecimalChars = [decimalSeparator, '.'];
  }
  let result = '';
  let seenDecimal = false;
  for (const ch of raw) {
    if (ch === '-') {
      if (result === '') result += ch;
      continue;
    }
    if (ch >= '0' && ch <= '9') { result += ch; continue; }
    if (!seenDecimal && acceptedDecimalChars.includes(ch)) {
      // Always record the CONFIGURED decimal separator downstream, whichever
      // accepted char was actually typed — formatGrouped()/toCleanValue()
      // only need to recognize one shape.
      result += decimalSeparator;
      seenDecimal = true;
    }
    // A stray thousands separator, a letter, a second decimal separator, a
    // misplaced '-' — dropped outright, never transiently inserted.
  }
  return result;
}

function groupIntegerDigits(digits, separator) {
  if (!digits) return digits;
  let result = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) result += separator;
    result += digits[i];
  }
  return result;
}

/** Rebuilds the grouped display string from a filtered (mask-clean) value. */
function formatGrouped(filtered, thousandsSeparator, decimalSeparator) {
  const negative = filtered.startsWith('-');
  const body = negative ? filtered.slice(1) : filtered;
  const sepIdx = body.indexOf(decimalSeparator);
  const intPart = sepIdx === -1 ? body : body.slice(0, sepIdx);
  const decPart = sepIdx === -1 ? null : body.slice(sepIdx + 1);
  const groupedInt = groupIntegerDigits(intPart, thousandsSeparator);
  const sign = negative ? '-' : '';
  return decPart === null ? `${sign}${groupedInt}` : `${sign}${groupedInt}${decimalSeparator}${decPart}`;
}

/**
 * Normalizes a filtered/masked value to the CLEAN, locale-independent shape
 * every downstream consumer expects: digits, an optional leading '-', at
 * most one '.'. This — NEVER the grouped display string — is what
 * MaskedAmountInput reports outward via onChange/onCommit (plan §6.3.2):
 * `useLineGrossAmount.js`'s arithmetic and the PATCH/POST body must never see
 * "1.234" and misread it as 1.234.
 */
function toCleanValue(filtered, decimalSeparator) {
  if (!filtered) return filtered;
  return decimalSeparator === '.' ? filtered : filtered.split(decimalSeparator).join('.');
}

/**
 * Idle (blurred) display for the current committed `value`. Currency/amount-
 * shaped fields (`grouping` true) route through the CANONICAL `formatCurrency()`
 * (ETP-5107 — this is the literal fix for Bug 3: Product's Price tab showing
 * `€ 79.9` instead of `79,90 €`) — called with no currency code so it returns
 * just the grouped, fixed-2-decimal NUMBER (no symbol; the symbol, when
 * `currency` is set, renders separately as its own overlay span below, so it
 * is never baked twice into the same string). Plain numeric fields
 * (`grouping` false) show the clean value verbatim, unformatted — matches
 * today's behavior for quantity/integer/number/decimal/percent fields (see
 * DataTable.numericClamp.vitest.jsx, ETP-4277).
 */
function toIdleDisplay(value, grouping) {
  if (value == null || value === '') return '';
  if (!grouping) {
    // Ungrouped, but STILL localized. The outward value is always clean (dot decimal), so a bare
    // String(value) rendered the JS number literal verbatim — `10.5` — leaving a period sitting in
    // a comma-decimal UI. That is what QA saw on the lines grid, where `% de descuento` showed
    // `10.5` next to a `12,00` price on the same row (ETP-5107 reopened). Only the thousands
    // grouping is skipped here; the decimal separator is never JS's.
    return formatPlainDecimal(value);
  }
  const formatted = formatCurrency(undefined, value);
  return formatted === '—' ? '' : formatted;
}

/**
 * Holded-style live-masked numeric input (ETP-5107). See
 * docs/plans/2026-09-08-etp5107-price-input-locale-fix.md §6.2/§6.3 for the
 * full research/design; condensed here:
 *
 * - The thousands separator (`getCurrencyFormatConfig().thousandsSeparator`)
 *   is NEVER a valid keystroke — it's computed/inserted automatically as the
 *   integer part grows past 3 digits, and correctly repositions itself as
 *   the user edits (only when `grouping` is true; e.g. cursor at the very
 *   start of "1.234,56", typing "9" produces "91.234,56").
 * - The decimal separator (`getCurrencyFormatConfig().decimalSeparator`) is
 *   the one special character the user can type, once.
 * - Letters, a second decimal separator, or a direct attempt to type the
 *   thousands separator are all rejected outright — never transiently
 *   inserted then removed (closes the silent-comma-drop bug, plan §5.1).
 * - A leading '-' is allowed at the very start, once (ETP-4567 — negative
 *   listPrice/orderedQuantity is a real, actively-tested capability for
 *   credit/return lines on Sales/Purchase Order; this component only allows
 *   the CHARACTER — whether a given field's result is actually accepted is
 *   still decided by the caller's own min/max clamp, unchanged).
 *
 * THE single most important correctness rule (plan §6.3.2/§9.3/§9.4): what
 * this component DISPLAYS (grouped, for the user's eyes) and what it reports
 * outward via onChange/onCommit are NEVER the same string — outward
 * callbacks always receive the CLEAN value (digits, optional leading '-', at
 * most one '.', normalized regardless of which separator was typed) plus the
 * parsed `Number` (or `null`). Every caller that does arithmetic on this
 * value must never see the grouped display string.
 *
 * @param {number|string|null} [value] - current committed value (clean, unmasked)
 * @param {(clean: string, parsed: number|null) => void} [onChange] - fires on every accepted keystroke
 * @param {(parsed: number|null, clean: string) => void} [onCommit] - fires on blur / Enter
 * @param {() => void} [onBlur] - caller-supplied blur handler, always still fires (e.g. DataTable's own min/max clamp)
 * @param {(e: KeyboardEvent) => void} [onKeyDown] - caller-supplied keydown handler, always still fires first
 * @param {string} [currency] - ISO 4217 code; omitted/null => no symbol (the default for line-grid cells)
 * @param {boolean} [bare=false] - skip the `Field`/label wrapper, for a dense table cell
 * @param {boolean} [grouping=true] - live thousands-grouping + 2-decimal idle format (price/amount-shaped fields); false keeps a plain, ungrouped look (quantity/integer/number/decimal/percent — matches today's behavior)
 * @param {import('react').RefObject} [inputRef] - optional external ref to the underlying input (e.g. for a caller-managed autoFocus)
 */
export function MaskedAmountInput({
  label, required, value, onChange, onCommit, onBlur, onFocus, onKeyDown, placeholder, disabled,
  className = '', name, currency, bare = false, grouping = true, autoFocus, inputRef,
  inputMode = 'decimal', 'data-testid': dataTestId,
}) {
  const internalRef = useRef(null);
  const activeRef = inputRef || internalRef;
  const [focused, setFocused] = useState(false);
  // What the field shows: the user's in-progress keystrokes (`draft`) while editing, and the
  // committed `value` the rest of the time — DERIVED on every render, never mirrored into state
  // by an effect.
  //
  // The semantics are the ones this component always had: while the field is focused the draft is
  // protected so a parent that re-formats on every change cannot fight the keystrokes, and the
  // moment the parent puts a different `value` on an unfocused field that value wins (which is
  // how typing 50 into the converted-amount field comes back as the formatted "50,00").
  //
  // What changed is WHEN that re-sync happens, and it is load-bearing rather than cosmetic
  // (ETP-5107). As an effect it ran AFTER the commit, so the DOM input kept the previous text for
  // one render. That single stale frame re-opened the ETP-4876 window in NewPaymentEntryModal:
  // when a real edit (blanking the amount) landed inside it, React's input value-tracker compared
  // the edit against the stale DOM value, judged it a no-op and never fired `onChange` — so the
  // converted amount never cleared and the exchange rate stayed seeded. Measured over 100 runs
  // each: 0 failures before this component rendered the field, 2 in 73 after, 0 after this fix.
  // Re-syncing during render closes the window: React re-renders before committing, so the DOM
  // never shows a value the component has already superseded.
  //
  // It also retires the old "commit tick": a commit the parent CLAMPS BACK to the value it already
  // held (type 220 into a credit line capped at 120) used to leave the rejected text on screen,
  // because neither `value` nor `focused` changed and the effect never re-ran. Blur drops the
  // draft outright, so the field re-reads the authoritative value whatever the parent decides.
  const [draft, setDraft] = useState(null);
  const [syncedOn, setSyncedOn] = useState({ value, grouping });
  if (!focused && (value !== syncedOn.value || grouping !== syncedOn.grouping)) {
    setSyncedOn({ value, grouping });
    setDraft(null);
  }
  const display = draft != null ? draft : toIdleDisplay(value, grouping);
  const desiredCursorRef = useRef(null);

  useLayoutEffect(() => {
    if (desiredCursorRef.current == null || !activeRef.current) return;
    const pos = desiredCursorRef.current;
    desiredCursorRef.current = null;
    try { activeRef.current.setSelectionRange(pos, pos); } catch { /* not focused/selectable */ }
  }, [display, activeRef]);

  const rightSide = isCurrencySymbolRightSide(currency);
  const symbol = currency ? (getCurrencySymbol(currency) || currency) : '';

  const handleChange = (e) => {
    const { thousandsSeparator, decimalSeparator } = getCurrencyFormatConfig();
    const rawValue = e.target.value;
    const cursorPos = e.target.selectionStart ?? rawValue.length;
    const groupSeparator = grouping ? thousandsSeparator : null;

    const sigBeforeCursor = countSignificantChars(rawValue.slice(0, cursorPos), groupSeparator);
    const filtered = filterMaskChars(rawValue, decimalSeparator, grouping);
    const newDisplay = grouping ? formatGrouped(filtered, thousandsSeparator, decimalSeparator) : filtered;

    desiredCursorRef.current = positionAfterSignificant(newDisplay, sigBeforeCursor, groupSeparator);
    setDraft(newDisplay);

    const clean = toCleanValue(filtered, decimalSeparator);
    onChange?.(clean, parseLocaleNumber(clean).value);
  };

  /**
   * ETP-5107 (QA round 2, §2 of the attached report) — pasting is NOT typing.
   *
   * Keystroke filtering has to drop a typed thousands separator: mid-typing, `12.` carries no
   * information about what comes next, so the mask cannot tell a decimal point from grouping and
   * the configured decimal separator is the only safe answer. A PASTE is different: the whole
   * string arrives at once, so the convention can be read off it. Without this, pasting a price
   * copied from a web page or an English-locale spreadsheet silently multiplied it: `129.56`
   * became `12.956,00` and `12.50` became `1.250,00`, with no warning and a clean save.
   *
   * A pasted string is exactly the problem `parseAmountInput` already solves for CSV/xlsx import
   * (ETP-4954): opaque text from an outside source whose separator convention is unknown. Reusing
   * it keeps paste and file import agreeing, instead of inventing a second heuristic here.
   *
   * Only a paste that REPLACES the whole value is treated as an import. Pasting into the middle of
   * an existing number is editing, not importing, so it falls through to the normal keystroke path.
   * The genuinely ambiguous shape (`1.500` — one separator, exactly 3 digits) stays with the
   * grouping reading, which is also what typing it produces.
   */
  const handlePaste = (e) => {
    const el = e.currentTarget;
    const pasted = e.clipboardData?.getData('text') ?? '';
    const selectsAll = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    if (!pasted.trim() || !(el.value === '' || selectsAll)) return;

    const parsed = parseAmountInput(pasted);
    if (parsed == null || !Number.isFinite(parsed)) return;

    e.preventDefault();
    const { thousandsSeparator, decimalSeparator } = getCurrencyFormatConfig();
    const clean = String(parsed);
    const filtered = filterMaskChars(clean.split('.').join(decimalSeparator), decimalSeparator, grouping);
    setDraft(grouping ? formatGrouped(filtered, thousandsSeparator, decimalSeparator) : filtered);
    onChange?.(clean, parsed);
  };

  const handleBlur = () => {
    setFocused(false);
    // Drop the editing draft so the field goes back to rendering the committed `value`,
    // whatever the parent makes of what was just committed (accepted, clamped or rejected).
    setDraft(null);
    const { decimalSeparator } = getCurrencyFormatConfig();
    // `display` may still hold a grouped string (when grouping is on) — re-run
    // the strict filter to strip it back down to the clean shape before commit.
    const filtered = grouping ? filterMaskChars(display, decimalSeparator, true) : display;
    const clean = toCleanValue(filtered, decimalSeparator);
    const parsed = parseLocaleNumber(clean).value;
    onCommit?.(parsed, clean);
    onBlur?.();
  };

  let paddingClass = '';
  if (symbol) {
    paddingClass = rightSide ? 'pr-8' : 'pl-8';
  }
  // `bare` (the 3 real call sites): `className` is the caller's own full cell
  // styling, applied directly to the input — mirrors DataTable's/InlineLinesPanel's
  // pre-existing raw-<input>/<Input> contract. Non-bare (unused today, kept for
  // API parity with AmountInput): `className` goes on the Field wrapper instead,
  // the input gets a fixed internal class string — matches AmountInput exactly.
  const inputClassName = bare
    ? `text-right tabular-nums ${paddingClass} ${className}`.trim()
    : `${paddingClass} text-right tabular-nums bg-card`.trim();

  const inputEl = (
    <Input
      ref={activeRef}
      type="text"
      inputMode={inputMode}
      value={display}
      onChange={handleChange}
      onPaste={handlePaste}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && e.key === 'Enter') { e.currentTarget.blur(); }
      }}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
      className={inputClassName}
      data-testid={dataTestId || (name ? `field-number-${name}` : 'field-number')} />
  );

  const withSymbol = symbol ? (
    <div className="relative">
      {inputEl}
      <span
        className={`pointer-events-none absolute ${rightSide ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted-foreground`}>
        {symbol}
      </span>
    </div>
  ) : inputEl;

  if (bare) return withSymbol;

  return (
    <Field
      label={label}
      required={required}
      className={className}
      data-testid="Field__masked-amount">
      {withSymbol}
    </Field>
  );
}

/**
 * Searchable lookup field shared across the app (G/L item, business partner…).
 * Built on Radix Popover (non-modal) so it positions, portals and closes-outside
 * correctly even inside the transformed Radix Dialog, and clicks aren't treated
 * as "outside the dialog". Focus stays on the input so the user can keep typing.
 *
 * @param {function} useLookup - hook `(query) => { results, loading }` returning
 *   `{ id, name }` rows. Pass a pre-bound hook (e.g. `(q) => useBPartnerLookup(q,
 *   'customer')`) to add extra args while keeping React's rules of hooks intact.
 * @param {{ id, name } | null} value
 * @param {(row: { id, name } | null) => void} onChange
 */
export function LookupPicker({ value, onChange, useLookup, placeholder = 'Buscar…' }) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const { results, loading } = useLookup(query);

  useEffect(() => { setQuery(value?.name ?? ''); }, [value]);

  const showList = open && (results.length > 0 || loading);

  return (
    <Popover open={showList} onOpenChange={setOpen} data-testid="Popover__7183e9">
      <PopoverAnchor asChild data-testid="PopoverAnchor__7183e9">
        <div className="relative">
          <Input
            className="bg-card pr-9"
            value={query}
            placeholder={placeholder}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(null); }}
            onFocus={() => setOpen(true)}
            data-testid="Input__7183e9" />
          <Search
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            data-testid="Search__7183e9" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        className="max-h-56 overflow-auto rounded-lg border border-[hsl(var(--border-control))] bg-card p-0 shadow-lg"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
        data-testid="PopoverContent__7183e9">
        {loading && results.length === 0 ? (
          <div className="px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">…</div>
        ) : null}
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => { onChange(r); setOpen(false); }}
            className="block w-full px-3 py-2 text-left text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
          >
            {r.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Chip-style searchable single-select, matching the Funds-transfer modal's
 * accounting-item selector: once chosen, the value shows as a removable chip
 * (label + ×) inside the field; clicking it returns to typing mode. The dropdown
 * is a Radix `Popover`, portalled to `document.body` and auto-flipping on collision,
 * so it is never clipped by an ancestor's overflow (e.g. a scrollable modal body).
 * Data comes from a `useLookup` hook, exactly like {@link LookupPicker}.
 *
 * Keyboard: ArrowUp/Down move a highlighted option (clamped, no wrap), Home/End jump
 * to the first/last, Enter commits the highlighted option (no fallback to the first
 * result if nothing is highlighted yet), Escape closes without changing the value —
 * ported from `CreatableSearchSelect`'s `handleInputKeyDown` (ETP-4924 follow-up).
 *
 * @param {{ id, name } | null} value
 * @param {(row: { id, name } | null) => void} onChange
 * @param {function} useLookup - hook `(query) => { results, loading }` returning `{ id, name }` rows
 * @param {string} [placeholder]
 * @param {string} [testId] - base for the field's data-testids
 */
export function ChipSelect({ value, onChange, useLookup, placeholder = 'Buscar…', testId = 'chip-select', disabled = false }) {
  const ui = useUI();
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const { results } = useLookup(query);
  const showChip = !!value && !editing;
  const close = () => { setOpen(false); setEditing(false); setQuery(''); };
  const startEditing = () => { setEditing(true); setOpen(true); setQuery(''); };

  // Keep focus in the input while the (portaled) list is open, so the user can keep typing.
  useEffect(() => { if (editing && open) inputRef.current?.focus(); }, [editing, open]);

  // Keyboard navigation over `results` (ported from CreatableSearchSelect's
  // handleInputKeyDown — the "Método de pago" field and every other generic
  // FK selector already behave this way; ChipSelect had no keyboard handling
  // at all until now, mouse-only). -1 = nothing highlighted.
  const [activeIndex, setActiveIndex] = useState(-1);

  // A fresh open or a changed search resets the highlight — a stale index from
  // a previous open/query would highlight the wrong option.
  useEffect(() => {
    setActiveIndex(-1);
  }, [open, query]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = dropdownRef.current?.querySelector(`[data-option-index="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  const selectResult = (r) => { onChange(r); close(); };

  const handleInputKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (results.length > 0) { e.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (results.length > 0) { e.preventDefault(); setActiveIndex(results.length - 1); }
        break;
      case 'Enter':
        if (activeIndex >= 0 && results[activeIndex]) {
          e.preventDefault();
          selectResult(results[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      default:
        break;
    }
  };

  // Radix Popover portals the list to the body and auto-flips on collision, so it is never
  // clipped by an ancestor's overflow (e.g. the modal body) — unlike an inline dropdown.
  return (
    <Popover open={!disabled && open} onOpenChange={(v) => { if (!disabled) (v ? setOpen(true) : close()); }} data-testid="Popover__chip">
      <PopoverAnchor asChild data-testid="PopoverAnchor__chip">
        <div
          // `group` is load-bearing, not decoration: SelectorChip's clear (X) is
          // `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`, so without a `.group`
          // ancestor it stays permanently invisible — the X was in the DOM but never shown in ANY
          // ChipSelect (this modal, GL Item Difference in Editar cuenta, the reconciliation payment
          // method, ManualStatementModal, PaymentForm, FundsTransferModal). CreatableSearchSelect,
          // which renders the same chip for the FK pickers in sales-invoice, has always had it.
          //
          // The box itself is deliberately the SAME shell CreatableSearchSelect draws for those FK
          // pickers — shared FIELD_HEIGHT, rounded-lg, token-based shadow, hover fill and a
          // ring-2/ring-primary focus state. It used to hardcode `h-10 rounded-md` with its own
          // focus treatment, which made an accounting-concept picker 4px taller and differently
          // rounded than the plain `Input` sitting right next to it in the same modal row (Importe),
          // let alone than the equivalent field in every generated window. Height, radius and focus
          // belong to the density tokens, not to this component.
          className={`group relative flex ${FIELD_HEIGHT} w-full min-w-0 items-center gap-1 rounded-lg border border-[hsl(var(--border-control))] px-2 shadow-[0px_1px_2px_hsl(var(--foreground)_/_0.05)] focus-within:ring-2 focus-within:ring-primary ${disabled ? 'bg-[hsl(var(--muted))] opacity-70' : 'bg-card hover:bg-[hsl(var(--muted))]'}`}
          onClick={!disabled && showChip ? startEditing : undefined}
        >
          {showChip ? (
            <SelectorChip
              label={value.name}
              onClick={startEditing}
              onClear={() => { onChange(null); close(); }}
              clearAriaLabel={ui('clear')}
              testId={`${testId}-chip`}
              disabled={disabled}
              data-testid={`${testId}-chip`} />
          ) : (
            <input
              ref={inputRef}
              // `text-ellipsis` so a placeholder/query wider than a narrow host column
              // (e.g. a lines table cell) crops with a visible "…" instead of an abrupt
              // raw cut — matches SelectorChip's own `truncate` on the selected-value label.
              className="h-full min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent px-1 text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))]"
              value={query}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => !disabled && setOpen(true)}
              onKeyDown={handleInputKeyDown}
              role="combobox"
              aria-expanded={open}
              data-testid={`${testId}-search`} />
          )}
          <ChevronDown className="ml-auto h-4 w-4 flex-none text-muted-foreground" data-testid={`${testId}-chevron`} />
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={dropdownRef}
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        // `z-[600]` overrides the shared PopoverContent's `z-50`. A dropdown has to paint above
        // whatever opened it, and this one is used inside hosts that stack far higher than 50 —
        // LifecycleConfirmModal's portal sits at 500 (it has to clear Radix dialogs), which left
        // the option list rendering BEHIND the card, with only the part overflowing past its bottom
        // edge visible. 600 clears that host while staying under the app's toast/overlay layers.
        className="z-[600] max-h-64 overflow-auto rounded-xl border border-[hsl(var(--border-control))] bg-card p-1.5 shadow-lg"
        // Auto-width, non-truncating panel (matches the "Impuesto" line-item selector,
        // InlineSearchCombo's ETP-4600 behavior): the field itself stays a fixed width,
        // but the dropdown grows to fit its longest option instead of wrapping a long
        // BPartner/GL-item name onto multiple lines. `minWidth` keeps it never narrower
        // than the trigger; `maxWidth` caps it so an extreme outlier can't blow past the
        // viewport (Radix's own collision/shift handling keeps it on-screen horizontally).
        style={{ minWidth: 'var(--radix-popover-trigger-width)', width: 'max-content', maxWidth: 'min(420px, 90vw)' }}
        data-testid={`${testId}-popover`}
        // Radix Dialog's page-scroll lock (react-remove-scroll) swallows native wheel
        // scrolling on this body-portalled list even though overflow-auto + a real
        // maxHeight are correctly set. Bypass it manually — same fix already used by
        // LookupPicker.jsx and CreatableSearchSelect.jsx for the identical scenario.
        // Only adjust when `e.defaultPrevented` is already true (react-remove-scroll's
        // capture-phase listener runs before this bubble-phase handler, so that flag
        // tells us whether native scroll was actually blocked) — ChipSelect's other
        // callers are all inside a Dialog today, but if one ever isn't, native
        // scrolling already works there and adding deltaY on top would double-scroll.
        onWheel={(e) => {
          e.stopPropagation();
          if (e.defaultPrevented) {
            e.currentTarget.scrollTop += e.deltaY;
          }
        }}
      >
        {results.length === 0 ? (
          <div className="px-2.5 py-3 text-sm text-[hsl(var(--muted-foreground))]">—</div>
        ) : null}
        {results.map((r, index) => (
          <button
            key={r.id}
            type="button"
            onClick={() => selectResult(r)}
            data-testid={`${testId}-option-${r.id}`}
            data-option-index={index}
            aria-selected={index === activeIndex}
            className={`flex w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-2.5 py-2 text-left text-sm text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--page-bg))] ${index === activeIndex || value?.id === r.id ? 'bg-[hsl(var(--page-bg))]' : ''}`}
          >
            {r.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function Note({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--border-subtle))] bg-card px-3 py-2.5 text-xs leading-[17px] text-[hsl(var(--muted-foreground))] [&_b]:font-semibold [&_b]:text-[hsl(var(--foreground))]">
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <div className="mb-3 mt-[18px] text-xs font-bold uppercase leading-4 tracking-[0.06em] text-[hsl(var(--text-disabled))] first:mt-1.5">
      {children}
    </div>
  );
}
