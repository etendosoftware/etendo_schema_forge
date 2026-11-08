import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import { MaskedAmountInput } from '@/components/forms/fields.jsx';
import { cn } from '@/lib/utils';

/**
 * Parse the committed value for the stepper ARITHMETIC only. An empty box is `null` (no value
 * yet), so the first click starts from the lower bound instead of inventing a 0 above it.
 */
function toNumberOrNull(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clamp(n, min, max) {
  let v = n;
  if (min != null && v < min) v = min;
  if (max != null && v > max) v = max;
  return v;
}

/**
 * The value one click of `delta` leads to: an empty box jumps to the lower bound (or 0), anything
 * else moves by `delta` and is clamped to `[min, max]`.
 */
export function nextStepperValue(raw, delta, { min, max } = {}) {
  const current = toNumberOrNull(raw);
  if (current == null) return clamp(min ?? 0, min, max);
  return clamp(current + delta, min, max);
}

const DIGITS_ONLY = /^\d*$/;
const SIGNED_DIGITS = /^-?\d*$/;

// Digits `max` needs (365 → 3), so a longer number can never be typed; null without a usable max.
function maxDigitsFor(max) {
  return max != null && max > 0 ? String(Math.trunc(max)).length : null;
}

/**
 * Keystroke / paste veto for an integer stepper, on MaskedAmountInput's CLEAN (dot-decimal)
 * value: no decimal separator ever, no minus sign when the lower bound is 0 or more, and no more
 * digits than `max` has (the payment-term selector's create modal allows 3 for 365). Without it
 * the box took "10,5" (a decimal comma is a legal amount keystroke) and only the backend refused
 * the fraction.
 *
 * @param {number} [min]
 * @param {number} [max]
 * @returns {(clean: string) => boolean}
 */
export function integerInputGuard(min, max) {
  const refusal = integerInputRefusal(min, max);
  return (clean) => refusal(clean) === null;
}

/**
 * Why an integer stepper refuses a clean candidate value: `'format'` (a decimal separator, a
 * sign it does not allow, any non-digit), `'range'` (more digits than `max` has — it can only be
 * above max), or `null` when it is accepted. The reason picks the message, as in the payment-term
 * selector's create modal, whose validator answers "out of range" for a 4th digit.
 *
 * @param {number} [min]
 * @param {number} [max]
 * @returns {(clean: string) => ('format'|'range'|null)}
 */
export function integerInputRefusal(min, max) {
  const pattern = min != null && min >= 0 ? DIGITS_ONLY : SIGNED_DIGITS;
  const maxDigits = maxDigitsFor(max);
  return (clean) => {
    if (!pattern.test(clean)) return 'format';
    if (maxDigits != null && clean.replace('-', '').length > maxDigits) return 'range';
    return null;
  };
}

// Derived test ids of the parts, or none when the host gave no `data-testid`.
function stepperTestIds(base) {
  if (!base) return {};
  return {
    box: `${base}-stepper`, decrement: `${base}-decrement`, increment: `${base}-increment`,
    rejected: `${base}-rejected`,
  };
}

/**
 * Refusal state of an integer stepper: the `isAllowed` veto for MaskedAmountInput (which also
 * records WHY it refused — MaskedAmountInput asks it before every keystroke and full-value paste,
 * and a refused edit leaves the box unchanged with no other callback), the message to show, and a
 * reset for blur. A non-integer stepper vetoes nothing.
 */
function useRefusalHint({ integer, min, max, rejectedMessage, rangeMessage }) {
  const [refusal, setRefusal] = useState(null); // null | 'format' | 'range'
  const refusalOf = integerInputRefusal(min, max);
  const isAllowed = integer
    ? (clean) => {
      const reason = refusalOf(clean);
      setRefusal(reason);
      return reason === null;
    }
    : undefined;
  // The raw text, before the amount mask strips a letter, a misplaced `-` or a `%` in silence:
  // anything the clean pattern would not accept is a FORMAT refusal (the selector's message).
  const rawPattern = min != null && min >= 0 ? DIGITS_ONLY : SIGNED_DIGITS;
  const isRawAllowed = integer
    ? (raw) => {
      if (rawPattern.test(raw)) return true;
      setRefusal('format');
      return false;
    }
    : undefined;
  const message = refusal === 'range' ? (rangeMessage ?? rejectedMessage) : rejectedMessage;
  return { isAllowed, isRawAllowed, hint: refusal ? message : null, clear: () => setRefusal(null) };
}

const STEP_BUTTON_CLASS =
  'flex h-[38px] w-10 shrink-0 items-center justify-center border-l border-border-structural text-icon-secondary transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-transparent';

/**
 * Integer input with − / + buttons inside the box (Figma "Número con stepper").
 *
 * Generic: any EntityForm field opts in with `stepper: true` (decisions.json), and the bounds are
 * the field's ordinary `min` / `max` (the same flat bounds `getNumericFieldError` and
 * `clampNumericFieldMax` already read). A button is disabled at its bound, so a click can never
 * produce an out-of-range value; a TYPED value goes through the host form's normal blur
 * validation instead.
 *
 * The text box is `MaskedAmountInput` (never a native `<input type="number">`, ETP-5107) and keeps
 * `id`, so the field `<Label htmlFor>` still targets it.
 *
 * @param {object}   props
 * @param {string}   props.id              DOM id — the field key, so the label associates
 * @param {string}   [props.name]
 * @param {string|number} props.value      committed value ('' when empty)
 * @param {(clean: string) => void} props.onChange   every keystroke and every click
 * @param {(clean: string) => void} [props.onCommit] typed value left on blur / Enter
 * @param {() => void} [props.onStep]      after a click changed the value (immediate-save hook)
 * @param {() => void} [props.onBlur]
 * @param {number}   [props.min]
 * @param {number}   [props.max]
 * @param {number}   [props.step=1]
 * @param {boolean}  [props.integer]       whole numbers only: a typed / pasted decimal separator,
 *                                         a minus sign when `min` ≥ 0, or more digits than `max`
 *                                         has, is refused outright
 * @param {string}   [props.rejectedMessage] shown under the box (role="alert") when a keystroke or
 *                                         paste was refused for its FORMAT — the InlineCreateModal
 *                                         UX; cleared by the next accepted keystroke and on blur
 * @param {string}   [props.rangeMessage]  same, for a value too long to be within `max`; falls
 *                                         back to `rejectedMessage`
 * @param {boolean}  [props.disabled]
 * @param {string}   [props.placeholder]
 * @param {boolean}  [props.required]
 * @param {string}   [props.className]     extra classes for the outer box
 */
export function NumberStepperInput({
  id, name, value, onChange, onCommit, onStep, onBlur, min, max, step = 1, integer = false,
  disabled = false, placeholder, required, className, rejectedMessage, rangeMessage,
  'data-testid': dataTestId,
}) {
  const ui = useUI();
  const testIds = stepperTestIds(dataTestId);
  const { isAllowed, isRawAllowed, hint, clear } = useRefusalHint({ integer, min, max, rejectedMessage, rangeMessage });
  const hintShown = Boolean(hint);
  const hintId = `${id}-rejected`;
  const current = toNumberOrNull(value);
  const atMin = min != null && current != null && current <= min;
  const atMax = max != null && current != null && current >= max;

  const stepBy = (delta) => {
    if (disabled) return;
    const next = String(nextStepperValue(value, delta, { min, max }));
    if (next === String(value ?? '')) return;
    onChange?.(next);
    onStep?.();
  };

  return (
    <div>
    <div
      className={cn(
        'flex h-10 w-full items-center overflow-hidden rounded-lg border border-border-control bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] transition-colors focus-within:ring-2 focus-within:ring-focus-ring',
        disabled && 'bg-muted',
        className,
      )}
      data-testid={testIds.box}
    >
      <MaskedAmountInput
        id={id}
        name={name ?? id}
        data-testid={dataTestId}
        value={value ?? ''}
        bare
        grouping={false}
        inputMode="numeric"
        isAllowed={isAllowed}
        isRawAllowed={isRawAllowed}
        aria-describedby={hintShown ? hintId : undefined}
        aria-invalid={hintShown ? true : undefined}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        onChange={(clean) => onChange?.(clean)}
        onCommit={(_parsed, clean) => onCommit?.(clean)}
        onBlur={() => {
          clear();
          onBlur?.();
        }}
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 !text-left text-sm leading-6 text-foreground shadow-none outline-none ring-0 hover:bg-transparent focus-visible:outline-none focus-visible:ring-0 disabled:bg-transparent" />
      <button
        type="button"
        onClick={() => stepBy(-step)}
        disabled={disabled || atMin}
        aria-label={ui('stepperDecrease')}
        aria-controls={id}
        data-testid={testIds.decrement}
        className={STEP_BUTTON_CLASS}
      >
        <Minus className="h-5 w-5" data-testid="Minus__5c1a7e" />
      </button>
      <button
        type="button"
        onClick={() => stepBy(step)}
        disabled={disabled || atMax}
        aria-label={ui('stepperIncrease')}
        aria-controls={id}
        data-testid={testIds.increment}
        className={STEP_BUTTON_CLASS}
      >
        <Plus className="h-5 w-5" data-testid="Plus__5c1a7e" />
      </button>
    </div>
    {hintShown && (
      <p
        id={hintId}
        role="alert"
        className="mt-2 text-sm text-destructive"
        data-testid={testIds.rejected}>
        {hint}
      </p>
    )}
    </div>
  );
}

export default NumberStepperInput;
