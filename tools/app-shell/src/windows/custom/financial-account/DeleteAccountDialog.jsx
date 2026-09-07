import { useState } from 'react';
import { toast } from 'sonner';
import { translateBackendError } from '@/lib/backendErrors.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { useAccountMutations } from '@/hooks/useAccountMutations.js';

/**
 * Confirmation dialog for permanently deleting a financial account (ETP-4871).
 *
 * Opened for ANY account since ETP-5111 — the row kebab no longer hides Eliminar when
 * `account.deletable` is false, so this dialog is now the confirmation for an account that may
 * well be refused. Every FK into `FIN_Financial_Account` is RESTRICT, so `deletable` means zero
 * dependent records anywhere (movements, statements, reconciliations, payments, payment proposals,
 * journal lines, bank-file exceptions, business partners defaulting to the account, or an active
 * bank connection); the backend re-validates on DELETE and answers 409, which is what explains the
 * refusal to the user. Same defense-in-depth shape as {@link ArchiveAccountDialog}'s
 * open-reconciliations guard, but the 409's sentence is English and goes through
 * `translateBackendError` rather than being shown verbatim.
 *
 * Deliberately a sibling of `ArchiveAccountDialog`, not a mode of it: deleting and archiving are
 * independent actions (a deletable account can still be archived instead, and vice versa is not
 * possible only because an archived account is not re-offered Eliminar until it is unarchived —
 * see `isDeleteMode` in `EditAccountModal.jsx`), so collapsing them into one `MODES`-style map
 * would need a third arm carrying an unrelated confirmation shape (no conflict key, no direction
 * derived from the record) for no shared logic.
 */
export function DeleteAccountDialog({ open, onClose, onDeleted, account }) {
  const ui = useUI();
  const { deleteAccount } = useAccountMutations();
  const [submitting, setSubmitting] = useState(false);

  if (!account) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await deleteAccount(account.id);
      toast.success(ui('financeAccountsDeleteSuccess'));
      onDeleted?.();
      onClose?.();
    } catch (err) {
      // The 409 carries the backend's own sentence, which is ENGLISH — it was being shown
      // verbatim, so this was the one account-delete surface that answered a Spanish-first UI in
      // English (ETP-5111). Routed through the shared translator, exactly like the bulk path and
      // the movements kebab, so all three read the same sentence. Falls back to the generic key
      // when there was no message at all.
      toast.error(translateBackendError(err?.message, ui) || ui('financeAccountsDeleteError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!value) onClose?.(); }}
      data-testid="Dialog__delete-account">
      <DialogContent className="max-w-md" data-testid="delete-account-dialog">
        <DialogHeader data-testid="DialogHeader__delete-account">
          <DialogTitle data-testid="DialogTitle__delete-account">
            {ui('financeAccountsDeleteConfirmTitle')}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__delete-account">
            {ui('financeAccountsDeleteConfirmMessage')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__delete-account">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            data-testid="Button__delete-account-cancel">
            {ui('financeAccountsArchiveCancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
            data-testid="delete-account-confirm"
          >
            {ui('financeAccountsDeleteConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
