import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';

/**
 * The app's ONE delete-confirmation dialog: "Eliminar registros / ¿Estás seguro de que deseas
 * eliminar N registro(s)?".
 *
 * Extracted verbatim from `useBatchDeleteDialog` (ETP-5111) — same markup, same i18n keys, same
 * `data-testid`s — so a per-row delete and a bulk delete of the same record are not two dialogs
 * that merely resemble each other. They are this component, rendered twice. The Movimientos row
 * kebab reaches for it directly with `count={1}` rather than going through `useBatchDeleteDialog`;
 * see that hook for why the hook itself is not the reuse vehicle.
 *
 * Deliberately presentational: no selection state, no delete call, no outcome toast. The caller
 * owns what confirming means, which is what lets the row kebab keep its own per-row success
 * message and its client-side eligibility pre-check while still showing this exact dialog.
 *
 * @param {{
 *   open: boolean,
 *   count: number,
 *   deleting?: boolean,
 *   onConfirm: () => void,
 *   onClose: () => void,
 * }} props
 */
export function DeleteConfirmDialog({ open, count, deleting = false, onConfirm, onClose }) {
  const ui = useUI();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      data-testid="Dialog__batch-delete">
      <DialogContent className="max-w-sm" data-testid="DialogContent__batch-delete">
        <DialogHeader data-testid="DialogHeader__batch-delete">
          <DialogTitle data-testid="DialogTitle__batch-delete">{ui('bulkDeleteConfirmTitle')}</DialogTitle>
          <DialogDescription data-testid="DialogDescription__batch-delete">
            {ui('bulkDeleteConfirmMessage', { count })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__batch-delete">
          <DialogClose asChild data-testid="DialogClose__batch-delete">
            <Button
              variant="outline"
              size="sm"
              disabled={deleting}
              data-testid="Button__batch-delete-cancel">{ui('cancel')}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            data-testid="batch-delete-confirm"
            onClick={onConfirm}
          >
            {ui('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteConfirmDialog;
