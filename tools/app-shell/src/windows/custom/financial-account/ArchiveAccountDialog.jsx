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
 * Confirmation dialog for archiving (soft-deleting) a financial account (ETP-4096), and for
 * restoring one that is already archived.
 *
 * The direction is derived from the record itself (`account.active === false` → restore) rather
 * than passed in as a prop: every call site already hands over the full account, so a `mode` prop
 * would just be threaded through four places to say something the data already says.
 *
 * Archiving can be rejected with HTTP 409 when the account has open reconciliations; that case
 * surfaces a specific message. Restoring has no such guard.
 */

/** Per-direction copy + behaviour. Same shape as the unreconcile dialog's action maps. */
const MODES = {
  archive: {
    titleKey: 'financeAccountsArchiveConfirmTitle',
    bodyKey: 'financeAccountsArchiveConfirmBody',
    confirmKey: 'financeAccountsArchiveConfirm',
    successKey: 'financeAccountsArchiveSuccess',
    errorKey: 'financeAccountsArchiveError',
    conflictKey: 'financeAccountsArchiveOpenRecon',
    variant: 'destructive',
  },
  unarchive: {
    titleKey: 'financeAccountsUnarchiveConfirmTitle',
    bodyKey: 'financeAccountsUnarchiveConfirmBody',
    confirmKey: 'financeAccountsUnarchiveConfirm',
    successKey: 'financeAccountsUnarchiveSuccess',
    errorKey: 'financeAccountsUnarchiveError',
    conflictKey: null,
    variant: 'default',
  },
};

/** `true` when the account is archived, i.e. the dialog restores instead of archiving. */
export function isUnarchiveMode(account) {
  return account?.active === false;
}

export function ArchiveAccountDialog({ open, onClose, onArchived, account }) {
  const ui = useUI();
  const { archiveAccount, unarchiveAccount } = useAccountMutations();
  const [submitting, setSubmitting] = useState(false);

  if (!account) return null;

  const unarchiving = isUnarchiveMode(account);
  const mode = unarchiving ? MODES.unarchive : MODES.archive;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await (unarchiving ? unarchiveAccount(account.id) : archiveAccount(account.id));
      toast.success(ui(mode.successKey));
      onArchived?.();
      onClose?.();
    } catch (err) {
      const conflict = mode.conflictKey && err.status === 409;
      toast.error(conflict ? ui(mode.conflictKey) : (err.message || ui(mode.errorKey)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!value) onClose?.(); }}
      data-testid="Dialog__fb3927">
      <DialogContent className="max-w-md" data-testid="archive-account-dialog">
        <DialogHeader data-testid="DialogHeader__fb3927">
          <DialogTitle data-testid="DialogTitle__fb3927">{ui(mode.titleKey)}</DialogTitle>
          <DialogDescription data-testid="DialogDescription__fb3927">{ui(mode.bodyKey)}</DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__fb3927">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            data-testid="Button__fb3927">
            {ui('financeAccountsArchiveCancel')}
          </Button>
          <Button
            variant={mode.variant}
            onClick={handleConfirm}
            disabled={submitting}
            data-testid="archive-account-confirm"
          >
            {ui(mode.confirmKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
