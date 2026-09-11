import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * FmRowActions — hover-revealed Edit/Delete icons for a draft declaration row
 * (ETP-5187). A lighter, window-specific counterpart to the generic
 * `RowQuickActions` (`tools/app-shell/src/components/contract-ui/RowQuickActions.jsx`):
 * same hover-reveal visual language (see `.fm-row-actions` in `fiscal-models.css`),
 * but only the 2 actions this window actually needs — no clone, no email/send,
 * no kebab menu. `RowQuickActions` itself can't be dropped in as-is here: its
 * hooks (`useDocumentAction`/`useNeoAction`) assume a schema-driven
 * `specName`/entity backend contract that this fully-custom window (no
 * `decisions.json`/`contract.json`) doesn't have.
 *
 * Caller is responsible for only rendering this for draft rows — this
 * component has no status awareness of its own.
 *
 * @param {{
 *   onEdit: () => void,
 *   onDelete: () => void,
 *   deleting?: boolean,
 * }} props
 */
export default function FmRowActions({ onEdit, onDelete, deleting = false }) {
  const ui = useUI();

  return (
    <div className="fm-row-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="fm-row-action-btn"
        onClick={onEdit}
        aria-label={ui('quickAction.edit') ?? 'Editar'}
        title={ui('quickAction.edit') ?? 'Editar'}
        data-testid="FmRowActions__edit"
      >
        <Pencil size={15} strokeWidth={1.75} data-testid="Pencil__fmRowActions" />
      </button>
      <button
        type="button"
        className="fm-row-action-btn fm-row-action-btn--danger"
        onClick={onDelete}
        disabled={deleting}
        aria-label={ui('quickAction.delete') ?? 'Eliminar'}
        title={ui('quickAction.delete') ?? 'Eliminar'}
        data-testid="FmRowActions__delete"
      >
        {deleting
          ? <Loader2
              size={15}
              strokeWidth={1.75}
              style={{ animation: 'spin 1s linear infinite' }}
              data-testid="Loader2__fmRowActions" />
          : <Trash2 size={15} strokeWidth={1.75} data-testid="Trash2__fmRowActions" />}
      </button>
    </div>
  );
}
