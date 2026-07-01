import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';

/**
 * Simple confirmation dialog used before destructive or overwrite actions.
 *
 * Props:
 *   open           - Whether the dialog is visible.
 *   onClose        - () => void. Called on cancel.
 *   onConfirm      - () => void. Called on confirm.
 *   title          - Optional override for the dialog title (defaults to "Confirm").
 *   message        - Optional override for the confirmation message.
 *   confirmLabel   - Optional override for the confirm button label (defaults to "delete").
 *   confirmVariant - Optional Shadcn Button variant for the confirm button (defaults to "destructive").
 */
export default function ConfirmDeleteDialog({ open, onClose, onConfirm, title, message, confirmLabel, confirmVariant = 'destructive' }) {
  const ui = useUI();

  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!value) onClose?.(); }}
      data-testid="Dialog__4d1545">
      <DialogContent data-testid="confirm-delete-dialog">
        <DialogHeader data-testid="DialogHeader__4d1545">
          <DialogTitle data-testid="DialogTitle__4d1545">{title || ui('confirm')}</DialogTitle>
          <DialogDescription data-testid="DialogDescription__4d1545">
            {message || ui('attachmentsConfirmDelete')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__4d1545">
          <Button type="button" variant="outline" data-testid="confirm-delete-cancel" onClick={() => onClose?.()}>
            {ui('cancel')}
          </Button>
          <Button type="button" variant={confirmVariant} data-testid="confirm-delete-confirm" onClick={handleConfirm}>
            {confirmLabel || ui('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
