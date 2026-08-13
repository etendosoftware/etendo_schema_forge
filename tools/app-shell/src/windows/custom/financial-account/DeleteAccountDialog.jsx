import { useState } from 'react';
import { toast } from 'sonner';
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
 * Only ever opened for an account whose `deletable` flag is true (every FK into
 * `FIN_Financial_Account` is RESTRICT, so `deletable` means zero dependent records anywhere —
 * movements, statements, reconciliations, payments, payment proposals, journal lines, bank-file
 * exceptions, business partners defaulting to the account, or an active bank connection). The
 * backend re-validates on DELETE regardless and answers 409 with a human-readable `message` if a
 * dependency appeared between the list load and this confirm — same defense-in-depth shape as
 * {@link ArchiveAccountDialog}'s open-reconciliations guard, except the 409 message here comes
 * straight from the backend (already localized/human-readable) rather than a local conflict key,
 * so it is shown verbatim instead of mapped through `ui(...)`.
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
      // 409 (a dependency appeared since the row was loaded) already carries a human-readable
      // message from the backend — shown as-is, not mapped through a local conflict key.
      toast.error(err.message || ui('financeAccountsDeleteError'));
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
