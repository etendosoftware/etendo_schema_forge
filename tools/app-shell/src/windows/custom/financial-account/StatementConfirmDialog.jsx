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

// i18n key triples per variant. Keeps the JSX free of nested ternaries.
// The `title`/`body`/`confirm` values are i18n KEYS resolved via ui(keys.title);
// they are not user-facing literals.
// i18n-allowlist: ["financeAccountStatementsProcessTitle", "financeAccountStatementsReactivateTitle", "financeAccountStatementsDeleteTitle"]
const VARIANT_KEYS = {
  process: {
    title: 'financeAccountStatementsProcessTitle',
    body: 'financeAccountStatementsProcessBody',
    confirm: 'financeAccountStatementsProcessConfirm',
  },
  reactivate: {
    title: 'financeAccountStatementsReactivateTitle',
    body: 'financeAccountStatementsReactivateBody',
    confirm: 'financeAccountStatementsReactivateConfirm',
  },
  delete: {
    title: 'financeAccountStatementsDeleteTitle',
    body: 'financeAccountStatementsDeleteBody',
    confirm: 'financeAccountStatementsDeleteConfirm',
  },
};

/**
 * Confirmation dialog shared by the "Process", "Reactivate" and "Delete" row
 * actions of an imported statement. The copy switches on {@code variant} and the
 * confirm button is destructive only for deletion.
 *
 * @param {{
 *   variant: 'process' | 'reactivate' | 'delete' | null,
 *   statement: object | null,
 *   busy: boolean,
 *   onConfirm: () => void,
 *   onClose: () => void,
 * }} props
 */
export function StatementConfirmDialog({ variant, statement, busy, onConfirm, onClose }) {
  const ui = useUI();
  const open = variant != null && statement != null;
  const isDelete = variant === 'delete';
  const name = statement?.name || statement?.documentNo || '';

  const keys = VARIANT_KEYS[variant] ?? VARIANT_KEYS.process;
  const title = ui(keys.title);
  const body = ui(keys.body, { name });
  const confirmLabel = ui(keys.confirm);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__858de3">
      <DialogContent className="max-w-md" data-testid="statement-confirm-dialog">
        <DialogHeader data-testid="DialogHeader__858de3">
          <DialogTitle data-testid="DialogTitle__858de3">{title}</DialogTitle>
          <DialogDescription data-testid="DialogDescription__858de3">{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__858de3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            data-testid="Button__858de3">
            {ui('financeAccountStatementsManualCancel')}
          </Button>
          <Button
            variant={isDelete ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={busy}
            data-testid="statement-confirm-action"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
