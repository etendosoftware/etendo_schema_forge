import { useLabel, useUI } from '@/i18n';
import { CUSTOMER_FIELD, VENDOR_FIELD, isChecked } from './bpCategoryContactTypes.js';
import { useNotifyOnHeaderSave } from './useAssociatedContactsNotice.js';

const TYPE_OPTIONS = [
  { field: CUSTOMER_FIELD, column: 'EM_Etgo_Iscustomer' },
  { field: VENDOR_FIELD, column: 'EM_Etgo_Isvendor' },
];

/**
 * Contact category header — the "Tipo de contacto" group (ETP-5791).
 *
 * Declared in decisions.json as the `customRenderer` of `etgoIscustomer`; it also owns
 * `etgoIsvendor` (declared `form: false`), writing it through EntityForm's `onFieldChange`.
 * `ownsLabel` makes EntityForm leave the legend to this component, so the required asterisk
 * and the "inherited by new contacts only" hint sit on the legend line.
 *
 * Each toggle is committed like any checkbox of the form (`onCommit` = the autosave hook on an
 * existing record). A category with neither type is refused by the backend
 * (`ETGO_BPGroupContactTypeRequired`, translated by lib/backendErrors.js) and the form rolls
 * the toggle back. A new category starts with both unchecked (AD default `N`).
 *
 * It is also the always-mounted piece of the detail form, so it hosts the "saved with associated
 * contacts" notice (see useAssociatedContactsNotice.js).
 */
export default function ContactTypeField({ record, readOnly, onFieldChange, onCommit, required = true }) {
  const ui = useUI();
  const t = useLabel();
  useNotifyOnHeaderSave(record);

  const toggle = (field) => {
    if (readOnly) return;
    onFieldChange?.(field, !isChecked(record?.[field]));
    onCommit?.();
  };

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" data-testid="bp-category-contact-type">
      <legend className="pb-3 text-sm font-medium text-foreground">
        {ui('bpCategoryContactType')}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        <span className="ml-1 font-normal text-[hsl(var(--muted-foreground))]">{ui('bpCategoryContactTypeHint')}</span>
      </legend>
      <div className="flex flex-wrap items-center gap-x-10 gap-y-2">
        {TYPE_OPTIONS.map(({ field, column }) => (
          // A native checkbox inside its <label>: the visible text is its accessible name and
          // Space toggles it from the keyboard.
          <label
            key={field}
            className={`flex items-center gap-2.5 text-sm font-medium text-foreground ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={isChecked(record?.[field])}
              disabled={readOnly}
              onChange={() => toggle(field)}
              className="h-4 w-4 shrink-0 rounded accent-[hsl(var(--primary))] disabled:cursor-not-allowed"
              data-testid={`field-${field}`} />
            <span>{t(column)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

ContactTypeField.ownsLabel = true;
