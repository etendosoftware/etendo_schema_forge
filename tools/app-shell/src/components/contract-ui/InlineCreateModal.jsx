import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { useUI } from '@/i18n';

/** Whether `value` satisfies the optional input restriction (pattern + max length). */
function isAcceptedInput(value, inputPattern, maxLength) {
  if (maxLength != null && value.length > maxLength) return false;
  return !inputPattern || inputPattern.test(value);
}

/**
 * InlineCreateModal — a minimal "create" dialog used by inline-creatable FK selectors
 * (e.g. match-rule transaction type, payment term). Mirrors the reject-reason create
 * popup: a single input plus Cancel / Create actions. By default the input is a Name;
 * a caller can relabel it, add a unit suffix and a validation step (ETP-5826: the
 * payment-term "days" input).
 *
 * Built on the shared Radix `Dialog` so it nests correctly inside the host window's
 * modal: Radix stacks the focus-trap and pointer-events, and portals the overlay to
 * document.body — so the backdrop covers the full viewport and focus stays in this
 * dialog (a body-portaled plain div would have its focus yanked back by the parent
 * dialog's focus trap, re-opening the selector behind it).
 *
 * @param {boolean}  open            - whether the dialog is shown.
 * @param {string}   title           - dialog heading (e.g. "Create transaction type").
 * @param {string}   namePlaceholder - placeholder for the input.
 * @param {string}   initialName     - pre-fills the input (the text typed in the selector).
 * @param {Function} onCancel        - () => void, closes without creating.
 * @param {Function} onSubmit        - async (value) => void, receives the trimmed value; throws
 *                                     to surface an error and keep the dialog open.
 * @param {Function} [validate]      - (value) => message | null, run on the trimmed value before
 *                                     `onSubmit`; a message is shown and nothing is submitted.
 *                                     When set, an empty input can be submitted so `validate`
 *                                     can explain why it is required.
 * @param {string}   [inputLabel]    - input label (default: the generic "Name").
 * @param {string}   [inputSuffix]   - unit shown after the input (e.g. "días").
 * @param {string}   [inputMode]     - the input's `inputMode` attribute (e.g. "numeric").
 * @param {RegExp}   [inputPattern]  - restricts what the input can hold (ETP-5826: `/^\d*$/` for a
 *                                     number of days). A change — typed or pasted — whose value does
 *                                     not match is NOT applied: the previous value stays and a message
 *                                     explains why (see `rejectedMessage`). A pre-fill that does not
 *                                     match opens the dialog empty.
 * @param {number}   [maxLength]     - longest value the input accepts; a longer change is rejected
 *                                     the same way (with a message, unlike the HTML attribute, which
 *                                     truncates silently).
 * @param {string}   [rejectedMessage] - message for a rejected change when `validate` has none for
 *                                     that value (e.g. "12 " passes `validate` once trimmed).
 */
export function InlineCreateModal({
  open,
  title,
  namePlaceholder,
  initialName = '',
  onCancel,
  onSubmit,
  validate,
  inputLabel,
  inputSuffix,
  inputMode,
  inputPattern,
  maxLength,
  rejectedMessage,
}) {
  const ui = useUI();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      // A pre-fill (the text typed in the selector, e.g. "Inme") the input could never hold
      // opens the dialog empty instead.
      setName(isAcceptedInput(initialName, inputPattern, maxLength) ? initialName : '');
      setError(null);
      setSaving(false);
    }
  }, [open, initialName, inputPattern, maxLength]);

  const trimmed = name.trim();
  const canSubmit = !saving && (!!trimmed || !!validate);

  const submit = async () => {
    if (!canSubmit) return;
    const problem = validate ? validate(trimmed) : null;
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (e) {
      setError(e?.message || ui('genericError'));
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const next = e.target.value;
    if (!isAcceptedInput(next, inputPattern, maxLength)) {
      // Keep the previous value and say why: the message the validator gives for the refused
      // value ("not a whole number", "out of range"), else the caller's generic one.
      setError((validate && validate(next)) || rejectedMessage || ui('genericError'));
      return;
    }
    setName(next);
    if (error) setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onCancel(); }}
      data-testid="Dialog__9acd2d">
      <DialogContent className="max-w-md gap-0 rounded-lg bg-card p-6" data-testid="inline-create-modal">
        <DialogHeader data-testid="DialogHeader__9acd2d">
          <DialogTitle className="text-xl" data-testid="DialogTitle__9acd2d">{title}</DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          <label htmlFor="inline-create-name" className="mb-1.5 block text-sm font-medium text-foreground">
            {inputLabel || ui('name')}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="inline-create-name"
              data-testid="inline-create-name"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              type="text"
              inputMode={inputMode}
              value={name}
              onChange={handleChange}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder={namePlaceholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'inline-create-error' : undefined}
              className="h-10 w-full rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] placeholder:text-[hsl(var(--muted-foreground))] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {inputSuffix && (
              <span className="shrink-0 text-sm text-muted-foreground" data-testid="inline-create-suffix">
                {inputSuffix}
              </span>
            )}
          </div>
          {error && (
            <p id="inline-create-error" role="alert" className="mt-2 text-sm text-destructive" data-testid="inline-create-error">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[hsl(var(--border-control))] bg-card px-4 text-sm font-medium text-[hsl(var(--foreground))] shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] transition-colors hover:bg-muted/40"
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            data-testid="inline-create-submit"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium leading-6 text-primary-foreground transition-colors disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground enabled:hover:bg-primary/90"
          >
            {saving ? ui('processing') : ui('create')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
