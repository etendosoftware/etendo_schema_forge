import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';

/**
 * Warns before a language change throws away unsaved form changes (ETP-5022).
 *
 * Switching language reloads the page — translated reference data is resolved server-side
 * per request, so data already fetched stays in the OLD language until re-fetched. That
 * reload discards whatever is unsaved, hence the confirmation.
 *
 * Deliberately offers only discard/cancel, no "save and switch": saving can fail on
 * validation or required fields, and a failed save followed by a reload would lose the
 * user's work while appearing to have saved it.
 *
 * @param {object} props
 * @param {boolean} props.open      whether the dialog is shown
 * @param {() => void} props.onConfirm  discard changes and switch (caller reloads)
 * @param {() => void} props.onCancel   keep editing, language unchanged
 */
export function LocaleChangeConfirmDialog({ open, onConfirm, onCancel }) {
  const ui = useUI();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onCancel?.(); }}
      data-testid="Dialog__locale-change">
      <DialogContent className="sm:max-w-md" data-testid="locale-change-confirm-dialog">
        <DialogHeader data-testid="DialogHeader__locale-change">
          <DialogTitle data-testid="DialogTitle__locale-change">
            {ui('localeChangeConfirmTitle')}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__locale-change">
            {ui('localeChangeConfirmBody')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__locale-change">
          <Button
            variant="outline"
            onClick={onCancel}
            data-testid="locale-change-cancel">
            {ui('cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            data-testid="locale-change-discard">
            {ui('localeChangeDiscardAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LocaleChangeConfirmDialog;
