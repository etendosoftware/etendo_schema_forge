import { CircleNotchIcon, CopyIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
// Same icons and row-action buttons as RowQuickActions (every other list), so the hover
// actions never mix icon families or sizes across windows.
import { ROW_ACTION_BUTTON_NEUTRAL, ROW_ACTION_BUTTON_DESTRUCTIVE } from './rowVisuals.js';
import { cn } from '@/lib/utils';

/**
 * Hover row actions (edit / clone / delete) — the RowQuickActions look: 20px icons on
 * the shared 32px row-action buttons (`rowVisuals.js`), a 20px spinner on the row being deleted.
 * Each button renders only when its handler is given (a read-only role gets none).
 *
 * Hidden at rest and shown on hover of the nearest `group/row` ancestor (or on keyboard focus),
 * so the host row must carry the `group/row` class.
 *
 * Extracted verbatim from `ListModalWindow` (the payment-term / match-rule grids) so a custom
 * grouped table can show the same hover actions — ETP-6365, Currency Conversion. The optional
 * props below default to exactly what `ListModalWindow` always rendered:
 *
 * @param {object} props
 * @param {object} props.row the row (its `id` keys the test ids)
 * @param {(row: object) => void} [props.onEdit]
 * @param {(row: object) => void} [props.onClone]
 * @param {(row: object) => void} [props.onDelete]
 * @param {boolean} [props.deleting] spinner on the delete button
 * @param {string} [props.className]
 * @param {(key: string) => string} props.ui
 * @param {string} [props.editLabel] accessible name of the edit button (default `ui('edit')`)
 * @param {string} [props.deleteLabel] accessible name of the delete button (default `ui('delete')`)
 * @param {string} [props.testIdPrefix] prefix of the button test ids (default `list-modal`)
 */
export function ListModalRowActions({
  row, onEdit, onClone, onDelete, deleting, className, ui,
  editLabel, deleteLabel, testIdPrefix = 'list-modal',
}) {
  const editText = editLabel ?? ui('edit');
  const deleteText = deleteLabel ?? ui('delete');
  return (
    <div className={cn('flex items-center justify-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100', className)}>
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(row)}
          aria-label={editText}
          title={editText}
          data-testid={`${testIdPrefix}-edit-${row.id}`}
          className={ROW_ACTION_BUTTON_NEUTRAL}>
          <PencilSimpleIcon className="h-5 w-5" aria-hidden="true" data-testid="IconicEditIcon__19eda5" />
        </button>
      )}
      {onClone && (
        <button
          type="button"
          onClick={() => onClone(row)}
          aria-label={ui('clone')}
          title={ui('clone')}
          data-testid={`${testIdPrefix}-clone-${row.id}`}
          className={ROW_ACTION_BUTTON_NEUTRAL}>
          <CopyIcon className="h-5 w-5" aria-hidden="true" data-testid="IconicCopyIcon__19eda5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(row)}
          disabled={deleting}
          aria-label={deleteText}
          title={deleteText}
          data-testid={`${testIdPrefix}-delete-${row.id}`}
          className={cn(ROW_ACTION_BUTTON_DESTRUCTIVE, deleting && 'opacity-60 cursor-wait')}>
          {deleting
            ? <CircleNotchIcon className="h-5 w-5 animate-spin" data-testid="Loader2__19eda5" />
            : <TrashIcon className="h-5 w-5" aria-hidden="true" data-testid="IconicTrashIcon__19eda5" />}
        </button>
      )}
    </div>
  );
}

export default ListModalRowActions;
