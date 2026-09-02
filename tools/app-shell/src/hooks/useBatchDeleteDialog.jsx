import { useCallback, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';
import { runBatchDelete, toastBatchDeleteOutcome } from '@/lib/batchDelete.js';

/**
 * Generic "checkbox selection → confirm-with-count → batch delete → 3-outcome
 * toast" dialog, independent of how the caller actually deletes one item
 * (REST DELETE against a NEO entity, an `archiveAccount()`-style mutation
 * hook, etc. — supplied as `deleteOneFn`). ETP-4656: extracted so
 * `useBulkRowDelete` (grid rows) and the Financial Accounts / Movements /
 * Statements bulk-delete additions all share the same dialog + outcome
 * wiring instead of re-implementing it.
 *
 * Returns:
 *   - requestBatchDelete(items): opens the confirm dialog for the given items
 *     (anything with enough identity for `deleteOneFn` to act on — filters
 *     out falsy entries).
 *   - batchDeleteDialog: JSX node the host must render once.
 *   - deleting: true while the batch is in flight.
 *
 * On confirm: runs `deleteOneFn` for every item (via `runBatchDelete`), fires
 * the single outcome toast (via `toastBatchDeleteOutcome` — which names the
 * reason when every failure shares one, so `deleteOneFn` should reject with the
 * backend's own message rather than a bare status code), then calls
 * `onOutcome(succeededItems, failedItems)` so the host can update its own
 * selection state:
 *   - all succeeded  → host clears the selection.
 *   - partial failure → host keeps only the failed items selected.
 *   - all failed      → host leaves the selection untouched.
 * The host is expected to re-fetch its list (when at least one item
 * succeeded) inside `onOutcome` — that naturally drops the deleted items and
 * leaves the failed ones in place, no manual list surgery needed here.
 */
export function useBatchDeleteDialog({ deleteOneFn, onOutcome }) {
  const ui = useUI();
  const [pendingItems, setPendingItems] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const requestBatchDelete = useCallback((items) => {
    const list = (items || []).filter(Boolean);
    if (!list.length) return;
    setPendingItems(list);
  }, []);

  const close = useCallback(() => {
    if (deleting) return;
    setPendingItems(null);
  }, [deleting]);

  const confirm = useCallback(async () => {
    if (!pendingItems?.length) return;
    setDeleting(true);
    try {
      const { succeeded, failed, errors } = await runBatchDelete(pendingItems, deleteOneFn);
      toastBatchDeleteOutcome(ui, { succeeded, failed, errors, total: pendingItems.length });
      setPendingItems(null);
      onOutcome?.(succeeded, failed);
    } finally {
      setDeleting(false);
    }
  }, [pendingItems, deleteOneFn, ui, onOutcome]);

  const count = pendingItems?.length ?? 0;

  const batchDeleteDialog = (
    <Dialog
      open={Boolean(pendingItems)}
      onOpenChange={(open) => { if (!open) close(); }}
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
            onClick={confirm}
          >
            {ui('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestBatchDelete, batchDeleteDialog, deleting };
}
