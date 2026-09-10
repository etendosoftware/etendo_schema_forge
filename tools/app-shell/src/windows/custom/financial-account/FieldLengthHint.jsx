// The two bits of UI every length-validated free-text field in this window renders: a live
// character counter and the inline error. Extracted because the three modals that use them
// (FundsTransferModal, NewTransactionModal, the movement wizard) rendered byte-identical
// markup apart from the testid — the exact copy-paste a PR review flagged.
//
// Deliberately TWO components rather than one combined block: the modals place them
// differently. The transfer modal puts the counter up on the label row and the error under
// the input; the other two put both in one row below. Owning the layout here would have
// meant changing an already-approved design to satisfy DRY, so each call site keeps its own
// arrangement and shares only what is actually the same.
import { useUI } from '@/i18n';

/**
 * Live `<used>/<limit>` counter. Always rendered, not only once exceeded — the point is to
 * see the limit coming while typing, which is too late if it appears only on failure. Turns
 * destructive past the limit, driven by the caller's already-computed error so the two can
 * never disagree.
 *
 * @param {*} value - the current field value.
 * @param {number} limit - the AD column length.
 * @param {object|null} error - the descriptor from getMaxLengthError, or null.
 * @param {string} testId - rendered as `<testId>-counter`.
 */
export function FieldLengthCounter({ value, limit, error, testId }) {
  return (
    <span
      className={`text-xs tabular-nums ${error ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`}
      data-testid={`${testId}-counter`}
    >
      {`${String(value ?? '').length}/${limit}`}
    </span>
  );
}

/**
 * The inline message for a failed length check. Renders nothing when `error` is null, so a
 * call site can drop it in unconditionally.
 *
 * @param {object|null} error - the `{ key, params }` descriptor from getMaxLengthError.
 * @param {string} testId - rendered as `<testId>-error`.
 */
export function FieldLengthError({ error, testId }) {
  const ui = useUI();
  if (!error) return null;
  return (
    // mr-auto so a row that also holds the counter keeps the message left and the counter
    // right without needing a filler element when there is no error.
    <p className="mr-auto text-sm text-[hsl(var(--destructive))]" data-testid={`${testId}-error`}>
      {ui(error.key, error.params)}
    </p>
  );
}
