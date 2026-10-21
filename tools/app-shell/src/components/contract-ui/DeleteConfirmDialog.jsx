import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';

/** Radix dismissal events (Escape, click on the scrim, focus leaving the dialog) are cancelled
 *  outright while the batch runs, so the lock does not depend on every caller's `onClose`
 *  guarding against `deleting` — FmListPage's, for one, does not. */
function preventWhile(locked) {
  return locked ? (event) => event.preventDefault() : undefined;
}

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
 * ETP-5758 — the in-progress state lives HERE, so every surface that deletes through this dialog
 * reads the same while the DELETEs run: the destructive button shows a spinner and "Eliminando…",
 * the description switches to "Eliminando N registro(s). Esto puede tardar unos segundos.",
 * Cancel is disabled, the corner X is hidden, Escape / outside clicks are swallowed, and the
 * dialog carries `aria-busy`. The dialog is therefore expected to stay OPEN until the batch
 * settles (which `useBatchDeleteDialog` does) — closing it before the requests run is exactly the
 * bug this ticket removed from Contacts and the document lines grids.
 *
 * `testIdScope` keeps each family of selectors stable: the default `batch-delete` is what the
 * financial-account surfaces have always published (`Dialog__batch-delete`,
 * `batch-delete-confirm`, …), and `useBulkRowDelete` passes `bulk-delete` so ListView /
 * ListModalWindow keep `Dialog__bulk-delete`, `bulk-delete-confirm`, `Button__bulk-delete-cancel`.
 *
 * @param {{
 *   open: boolean,
 *   count: number,
 *   deleting?: boolean,
 *   onConfirm: () => void,
 *   onClose: () => void,
 *   testIdScope?: string,
 * }} props
 */
export function DeleteConfirmDialog({
  open, count, deleting = false, onConfirm, onClose, testIdScope = 'batch-delete',
}) {
  const ui = useUI();
  const scope = testIdScope;
  const lock = preventWhile(deleting);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next && !deleting) onClose?.(); }}
      data-testid={`Dialog__${scope}`}>
      <DialogContent
        // `[&>button]:hidden` hides the primitive's own corner X (DialogContent's only direct
        // <button> child) while deleting; the footer buttons sit inside DialogFooter.
        className={deleting ? 'max-w-sm [&>button]:hidden' : 'max-w-sm'}
        aria-busy={deleting || undefined}
        onEscapeKeyDown={lock}
        onPointerDownOutside={lock}
        onInteractOutside={lock}
        data-testid={`DialogContent__${scope}`}>
        <DialogHeader data-testid={`DialogHeader__${scope}`}>
          <DialogTitle data-testid={`DialogTitle__${scope}`}>{ui('bulkDeleteConfirmTitle')}</DialogTitle>
          <DialogDescription aria-live="polite" data-testid={`DialogDescription__${scope}`}>
            {deleting
              ? ui('bulkDeleteInProgressMessage', { count })
              : ui('bulkDeleteConfirmMessage', { count })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid={`DialogFooter__${scope}`}>
          <DialogClose asChild data-testid={`DialogClose__${scope}`}>
            <Button
              variant="outline"
              size="sm"
              disabled={deleting}
              data-testid={`Button__${scope}-cancel`}>{ui('cancel')}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            data-testid={`${scope}-confirm`}
            onClick={onConfirm}
          >
            {deleting && (
              // 14px, white (`currentColor` on the destructive button), 0.8s linear turn — the
              // design mock. `!size-3.5` beats Button's own `[&_svg]:size-4`.
              <Loader2
                aria-hidden="true"
                className="!size-3.5 animate-spin [animation-duration:0.8s]"
                data-testid={`${scope}-spinner`} />
            )}
            {deleting ? ui('bulkDeleteInProgress') : ui('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteConfirmDialog;
