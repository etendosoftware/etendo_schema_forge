import { useRef } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';

/** Radix dismissal events (Escape, click outside) are cancelled outright while the batch runs. */
function preventWhile(locked) {
  return locked ? (event) => event.preventDefault() : undefined;
}

function dialogCopy(ui, count, running) {
  const one = count === 1;
  let body = ui(one ? 'invoiceInboxDiscardBodyOne' : 'invoiceInboxDiscardBodyMany');
  if (running) body = ui('invoiceInboxDiscardInProgress');
  return {
    title: one ? ui('invoiceInboxDiscardTitleOne') : ui('invoiceInboxDiscardTitleMany', { count }),
    body,
    confirm: ui(running ? 'invoiceInboxDiscarding' : 'invoiceInboxBulkDiscard'),
  };
}

/**
 * ETP-6049 — confirmation of "Discard" in the Invoice Inbox, for the batch bar and the row trash
 * (`count` 1). Shaped like the shared `DeleteConfirmDialog` (same primitives, same busy lock), but
 * its own copy: discarding is not deleting, and the document stays in "Descartadas".
 *
 * Opens with the focus on Cancel (the action cannot be undone). While `running`: `aria-busy`,
 * Cancel and Discard disabled, the corner X hidden, Escape and clicks outside ignored, a spinner
 * on Discard; the dialog stays open until the caller closes it after the batch.
 *
 * @param {{ open: boolean, count: number, running?: boolean, onConfirm: () => void,
 *   onClose: () => void }} props
 */
export default function InvoiceInboxDiscardDialog({ open, count, running = false, onConfirm, onClose }) {
  const ui = useUI();
  const cancelRef = useRef(null);
  const lock = preventWhile(running);
  const copy = dialogCopy(ui, count, running);
  const focusCancel = (event) => {
    event.preventDefault();
    cancelRef.current?.focus();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next && !running) onClose?.(); }}
      data-testid="Dialog__invoice-inbox-discard">
      <DialogContent
        className={running ? 'max-w-sm [&>button]:hidden' : 'max-w-sm'}
        aria-busy={running || undefined}
        onOpenAutoFocus={focusCancel}
        onEscapeKeyDown={lock}
        onPointerDownOutside={lock}
        onInteractOutside={lock}
        data-testid="invoice-inbox-discard-dialog">
        <DialogHeader data-testid="DialogHeader__invoice-inbox-discard">
          <DialogTitle data-testid="invoice-inbox-discard-dialog-title">{copy.title}</DialogTitle>
          <DialogDescription aria-live="polite" data-testid="invoice-inbox-discard-dialog-body">
            {copy.body}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__invoice-inbox-discard">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            size="sm"
            disabled={running}
            onClick={onClose}
            data-testid="invoice-inbox-discard-cancel">
            {ui('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={running}
            onClick={onConfirm}
            data-testid="invoice-inbox-discard-confirm">
            {running
              ? <Loader2
                  aria-hidden="true"
                  className="!size-3.5 animate-spin [animation-duration:0.8s]"
                  data-testid="invoice-inbox-discard-spinner" />
              : <Trash2 aria-hidden="true" data-testid="Trash2__invoice-inbox-discard" />}
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
