import { Pencil, Trash2, Loader2, RotateCcw } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * FmRowActions — hover-revealed row action icons for a declaration row: Edit/Delete
 * (ETP-5187, draft rows only) and Reactivar (ETP-5338, submitted/submitted_ack rows
 * only, excluding aeat_telematic). A lighter, window-specific counterpart to the
 * generic `RowQuickActions` (`tools/app-shell/src/components/contract-ui/RowQuickActions.jsx`):
 * same hover-reveal visual language (see `.fm-row-actions` in `fiscal-models.css`),
 * but only the actions this window actually needs — no clone, no email/send,
 * no kebab menu. `RowQuickActions` itself can't be dropped in as-is here: its
 * hooks (`useDocumentAction`/`useNeoAction`) assume a schema-driven
 * `specName`/entity backend contract that this fully-custom window (no
 * `decisions.json`/`contract.json`) doesn't have.
 *
 * Caller is responsible for the status gating — this component has no status
 * awareness of its own. `onEdit`/`onDelete` and `onReactivate` are mutually
 * exclusive in practice (a row is either draft, or submitted/submitted_ack —
 * never both), but each action only renders when its handler prop is passed,
 * so the component itself doesn't need to know which case it's in.
 *
 * @param {{
 *   onEdit?: () => void,
 *   onDelete?: () => void,
 *   onReactivate?: () => void,
 *   deleting?: boolean,
 *   reactivating?: boolean,
 * }} props
 */
export default function FmRowActions({ onEdit, onDelete, onReactivate, deleting = false, reactivating = false }) {
  const ui = useUI();

  return (
    <div className="fm-row-actions" onClick={(e) => e.stopPropagation()}>
      {onEdit && (
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
      )}
      {onDelete && (
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
      )}
      {onReactivate && (
        <button
          type="button"
          className="fm-row-action-btn"
          onClick={onReactivate}
          disabled={reactivating}
          aria-label={ui('fm.action.reactivate') ?? 'Reactivar'}
          title={ui('fm.action.reactivate') ?? 'Reactivar'}
          data-testid="FmRowActions__reactivate"
        >
          {reactivating
            ? <Loader2
                size={15}
                strokeWidth={1.75}
                style={{ animation: 'spin 1s linear infinite' }}
                data-testid="Loader2__fmRowActionsReactivate" />
            : <RotateCcw size={15} strokeWidth={1.75} data-testid="RotateCcw__fmRowActions" />}
        </button>
      )}
    </div>
  );
}
