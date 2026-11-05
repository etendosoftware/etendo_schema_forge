import { useId } from 'react';
import { useLabel, useUI } from '@/i18n';
import { SquareCheckbox } from '@/windows/custom/shared/SquareCheckbox.jsx';
import { FIELD_HEIGHT, LABEL_GAP } from '@/components/ui/formDensity';
import { isChecked } from './bpCategoryContactTypes.js';

/**
 * Contact category header — the "Valor por defecto" checkbox under the "Asignación
 * predeterminada" caption (ETP-5791, Figma "Form View Categoría de contacto", flag on only).
 *
 * The generic EntityForm checkbox has no caption line, so with the `contact-category-type` flag on
 * the window wrapper swaps the `default` field's renderer for this one (a `customRenderer` with
 * `ownsLabel`). It is the same field and the same write path: `onChange(next)` plus `onCommit()`
 * (EntityForm's checkbox immediate-save hook), and the shared `SquareCheckbox`, which draws the
 * same box as the generic checkbox. The checkbox keeps the AD label of `IsDefault`.
 */
export default function DefaultAssignmentField({ value, onChange, onCommit, readOnly }) {
  const ui = useUI();
  const t = useLabel();
  const captionId = useId();
  const checked = isChecked(value);
  return (
    <div
      role="group"
      aria-labelledby={captionId}
      className={LABEL_GAP}
      data-testid="bp-category-default-assignment">
      <span id={captionId} className="block text-sm font-medium text-foreground">
        {ui('bpCategoryDefaultAssignment')}
      </span>
      <div className={`flex items-center ${FIELD_HEIGHT}`}>
        <SquareCheckbox
          label={t('IsDefault')}
          checked={checked}
          disabled={readOnly}
          onChange={() => {
            if (readOnly) return;
            onChange?.(!checked);
            onCommit?.();
          }}
          data-testid="field-default" />
      </div>
    </div>
  );
}

DefaultAssignmentField.ownsLabel = true;
