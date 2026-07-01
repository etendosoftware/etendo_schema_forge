import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { useUI } from '@/i18n';

/**
 * InlineCreateModal — a minimal "create by name" dialog used by inline-creatable FK
 * selectors (e.g. match-rule transaction type). Mirrors the reject-reason create
 * popup: a single Name field plus Cancel / Create actions.
 *
 * Built on the shared Radix `Dialog` so it nests correctly inside the host window's
 * modal: Radix stacks the focus-trap and pointer-events, and portals the overlay to
 * document.body — so the backdrop covers the full viewport and focus stays in this
 * dialog (a body-portaled plain div would have its focus yanked back by the parent
 * dialog's focus trap, re-opening the selector behind it).
 *
 * @param {boolean}  open            - whether the dialog is shown.
 * @param {string}   title           - dialog heading (e.g. "Create transaction type").
 * @param {string}   namePlaceholder - placeholder for the name input.
 * @param {string}   initialName     - pre-fills the input (the text typed in the selector).
 * @param {Function} onCancel        - () => void, closes without creating.
 * @param {Function} onSubmit        - async (name) => void; throws to surface an error
 *                                     and keep the dialog open.
 */
export function InlineCreateModal({
  open,
  title,
  namePlaceholder,
  initialName = '',
  onCancel,
  onSubmit,
}) {
  const ui = useUI();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
      setSaving(false);
    }
  }, [open, initialName]);

  const trimmed = name.trim();
  const canSubmit = !!trimmed && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (e) {
      setError(e?.message || ui('genericError'));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onCancel(); }}
      data-testid="Dialog__9acd2d">
      <DialogContent className="max-w-md gap-0 rounded-lg bg-white p-6" data-testid="inline-create-modal">
        <DialogHeader data-testid="DialogHeader__9acd2d">
          <DialogTitle className="text-xl" data-testid="DialogTitle__9acd2d">{title}</DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          <label htmlFor="inline-create-name" className="mb-1.5 block text-sm font-medium text-foreground">
            {ui('name')}
          </label>
          <input
            id="inline-create-name"
            data-testid="inline-create-name"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder={namePlaceholder}
            className="h-10 w-full rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm shadow-[0px_1px_2px_rgba(18,18,23,0.05)] placeholder:text-[#6C6C89] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#D1D4DB] bg-white px-4 text-sm font-medium text-[#121217] shadow-[0px_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-muted/40"
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            data-testid="inline-create-submit"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-4 py-2 text-sm font-medium leading-6 text-white transition-colors disabled:bg-[#D1D4DB] disabled:text-white enabled:bg-[#121217] enabled:hover:bg-[#FFD500] enabled:hover:text-[#121217]"
          >
            {saving ? ui('processing') : ui('create')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
