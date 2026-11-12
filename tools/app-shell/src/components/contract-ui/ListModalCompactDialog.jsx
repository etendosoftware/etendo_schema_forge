import { Save, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { EntityForm } from './EntityForm.jsx';

// Figma "Editar condición de pago" elevation: a 1px ring plus four soft layers, all in the ink
// colour (the `--foreground` token) at the design's opacities.
const DIALOG_SHADOW =
  'shadow-[0_0_0_1px_hsl(var(--foreground)/0.1),0_24px_48px_hsl(var(--foreground)/0.03),0_10px_18px_hsl(var(--foreground)/0.03),0_5px_8px_hsl(var(--foreground)/0.04),0_2px_4px_hsl(var(--foreground)/0.04)]';

// Footer pills (Figma "Botones"): 40px, 8px/12px padding, fully rounded.
const PILL_BASE =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium leading-6 transition-colors disabled:cursor-not-allowed';
const CANCEL_PILL = `${PILL_BASE} border border-border-control bg-card text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] hover:bg-muted disabled:opacity-50`;
const SAVE_PILL = `${PILL_BASE} bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] disabled:bg-[hsl(var(--border-control))]`;

// Body gaps (Figma): 20px between field blocks, 16px between the rows of a checkbox group.
const FIELD_GAP = 20;
const CHECKBOX_GAP = 16;

/**
 * Group the fields into consecutive runs of checkboxes vs everything else, keeping their order.
 * Each run becomes its own one-column EntityForm, so a checkbox group gets its tighter row gap
 * without reordering anything. `span` is dropped: in a single column a span would only create
 * implicit grid columns.
 *
 * @param {Array<object>} fields
 * @returns {Array<{ key: string, checkbox: boolean, fields: Array<object> }>}
 */
export function splitCompactRuns(fields) {
  const runs = [];
  for (const f of fields) {
    const checkbox = f.type === 'checkbox' && !f.toggle;
    const last = runs.at(-1);
    const field = { ...f, span: undefined };
    if (last?.checkbox === checkbox) last.fields.push(field);
    else runs.push({ key: f.key, checkbox, fields: [field] });
  }
  return runs;
}

/**
 * The list-modal create/edit popup in its compact variant (`templateConfig.modalVariant:
 * "compact"`): a 400px dialog with the title, the fields stacked in ONE column with no section
 * headings, and a footer with an outline "Cancel" pill (closes) and a primary "Save" pill with a
 * save icon. Built for small catalogs (a payment term is a name, a number and two flags), where
 * the default wide multi-column modal is mostly empty space.
 *
 * Purely presentational: the host (`ListModalWindow`) owns the form state, the validation and
 * the save, exactly as for the default modal.
 */
export function ListModalCompactDialog({
  open, onClose, title, subtitle, fields, entity, formData, onFieldChange,
  api, token, apiBaseUrl, formError, onSubmit, submitDisabled, submitting, submitLabel, ui,
}) {
  const runs = splitCompactRuns(fields);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      data-testid="Dialog__c0a1d4">
      <DialogContent
        className={`flex max-h-[90vh] w-[400px] max-w-[calc(100vw-32px)] flex-col gap-2 overflow-hidden rounded-lg border-0 bg-card p-0 py-2 [&>button]:hidden ${DIALOG_SHADOW}`}
        data-testid="list-modal-compact-dialog">
        <DialogHeader className="space-y-0.5 px-7 py-3 pr-12 text-left" data-testid="DialogHeader__c0a1d4">
          <DialogTitle
            className="text-xl font-semibold leading-7 tracking-[-0.005em] text-foreground"
            data-testid="DialogTitle__c0a1d4">
            {title}
          </DialogTitle>
          {subtitle && (
            <p className="text-sm leading-5 text-muted-foreground" data-testid="list-modal-subtitle">
              {subtitle}
            </p>
          )}
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-7 py-3">
          {runs.map((run) => (
            <EntityForm
              key={run.key}
              entity={entity}
              fields={run.fields}
              data={formData}
              onChange={onFieldChange}
              api={api}
              token={token}
              apiBaseUrl={apiBaseUrl}
              labelOverrides={api?.labelOverrides}
              cols={1}
              gap={run.checkbox ? CHECKBOX_GAP : FIELD_GAP}
              variant="compact"
              data-testid="EntityForm__c0a1d4" />
          ))}
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <X size={16} className="mt-0.5 flex-shrink-0" data-testid="X__c0a1d4" />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-7 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="list-modal-cancel"
            className={CANCEL_PILL}>
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            data-testid="list-modal-submit"
            className={SAVE_PILL}>
            <Save className="h-5 w-5" aria-hidden="true" data-testid="Save__c0a1d4" />
            {submitting ? ui('saving') : submitLabel}
          </button>
        </div>

        {/* Last in the DOM so the dialog's initial focus lands on the first field, not here.
            Wrapped, never a direct child: `[&>button]:hidden` above hides every DIRECT child
            button — that is how the base dialog's own X is removed — and hid this one too. */}
        <div className="absolute right-1 top-1">
          <button
            type="button"
            onClick={onClose}
            aria-label={ui('close')}
            data-testid="list-modal-close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-icon-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
            <X className="h-5 w-5" aria-hidden="true" data-testid="X__c0a1d4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ListModalCompactDialog;
