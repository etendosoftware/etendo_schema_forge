import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useUI } from '@/i18n';
import { MaskedAmountInput } from '@/components/forms/fields.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { sameAmount, validateBoundedAmount, BOUNDED_AMOUNT_ERRORS } from '@/lib/boundedAmount.js';

/** The translated message of a {@link validateBoundedAmount} refusal. */
export function boundedAmountMessage(ui, errorKey, max, currency) {
  if (!errorKey) return '';
  if (errorKey === BOUNDED_AMOUNT_ERRORS.exceedsMax) {
    return ui(errorKey, { max: formatCurrency(currency, Math.abs(Number(max))) });
  }
  return ui(errorKey);
}

/**
 * ETP-6148 — an always-visible amount input with a small reset (↻) button inside, the Holded
 * «A remesar» cell. The reset puts back `resetValue` (for a remittance line, the due's
 * outstanding). The typed amount is validated against `max` with {@link validateBoundedAmount}:
 * not empty, not 0, the sign of `max`, and no larger than it in magnitude. An invalid amount stays
 * on screen with a red border; its message is the input's tooltip and accessible description.
 *
 * Two ways to use it, both through the same rules:
 * - committed on blur (the line grid): `onCommit(number)` runs only for a VALID amount that
 *   differs from `value`; `onInvalid(message)` runs for an invalid one. A rejected commit (the
 *   promise rejects) is caught here and never escapes as an unhandled rejection: telling the
 *   user is the caller's job (InlineLinesPanel's commitField toasts the failure itself), and the
 *   draft is dropped, so the input shows the stored `value` again — the value that is still
 *   saved, since the save did not happen.
 * - live (the picker modal): `onChange(clean)` reports every keystroke and the reset, and the
 *   parent keeps the value and decides what to do with an invalid one.
 *
 * Money formatting goes through MaskedAmountInput (instance separators) and `formatCurrency`
 * (the reset tooltip and the over-the-maximum message).
 */
export function ResettableAmountInput({
  value,
  resetValue,
  max,
  currency,
  onChange,
  onCommit,
  onInvalid,
  disabled = false,
  ariaLabel,
  className = '',
  'data-testid': dataTestId = 'resettable-amount',
}) {
  const ui = useUI();
  // The user's typed value while it is not yet accepted (null = show `value`).
  const [draft, setDraft] = useState(null);
  const shown = draft ?? value;
  const { error } = validateBoundedAmount(shown, max);
  const message = boundedAmountMessage(ui, error, max, currency);
  const canReset = !disabled && resetValue != null && !sameAmount(shown, resetValue);
  const resetLabel = ui('resetAmountTo', { amount: formatCurrency(currency, Number(resetValue)) });
  const describedBy = message ? `${dataTestId}-error` : undefined;

  const commit = async (clean) => {
    const result = validateBoundedAmount(clean, max);
    if (result.error) {
      onInvalid?.(boundedAmountMessage(ui, result.error, max, currency));
      return;
    }
    if (!onCommit || sameAmount(result.value, value)) {
      setDraft(null);
      return;
    }
    try {
      await onCommit(result.value);
    } catch {
      // Reported by the caller (see the JSDoc); the stored value below is still the truth.
    } finally {
      setDraft(null);
    }
  };

  const handleChange = (clean) => {
    setDraft(clean);
    onChange?.(clean);
  };

  const handleReset = () => {
    const restored = String(resetValue);
    setDraft(onCommit ? restored : null);
    onChange?.(restored);
    if (onCommit) commit(restored);
  };

  return (
    <div
      className={`relative flex w-full items-center ${className}`.trim()}
      title={message || undefined}
      data-testid={dataTestId}
    >
      <MaskedAmountInput
        bare
        value={shown ?? ''}
        onChange={(clean) => handleChange(clean)}
        onCommit={(_parsed, clean) => { commit(clean); }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={message ? 'true' : undefined}
        aria-describedby={describedBy}
        className={[
          'h-8 w-full pr-8 text-sm bg-card',
          message ? 'border-destructive focus-visible:ring-destructive' : 'border-input',
        ].join(' ')}
        data-testid={`${dataTestId}-input`} />
      {canReset && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleReset(); }}
          aria-label={resetLabel}
          title={resetLabel}
          className="absolute right-1 flex h-6 w-6 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-muted hover:text-foreground"
          data-testid={`${dataTestId}-reset`}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" data-testid="RotateCcw__6148r3" />
        </button>
      )}
      {message && (
        <span id={describedBy} role="alert" className="sr-only" data-testid={`${dataTestId}-error`}>
          {message}
        </span>
      )}
    </div>
  );
}

export default ResettableAmountInput;
