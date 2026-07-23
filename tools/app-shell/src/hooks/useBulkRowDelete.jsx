import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { buildHeaders } from '@/auth/api';
import { useUI } from '@/i18n';
import { extractErrorMessage } from '@/hooks/useEntity';

/**
 * Grid multi-select bulk delete — same styled confirm modal `useRowDelete`
 * uses, sized for N rows instead of one (ETP-4656).
 *
 * Returns:
 *   - requestBulkDelete(rows): opens the confirm dialog for the given rows —
 *     wire as the "Delete selected" toolbar action's onClick.
 *   - bulkDeleteDialog: JSX node the host must render once.
 *   - deleting: true while the batch is in flight (disable the trigger button).
 *
 * On confirm: issues one DELETE per row (in parallel), then reports back via
 * `onSuccess(succeededRows, failedRows)` so the host can update its own
 * selection state:
 *   - all succeeded  → host clears the selection.
 *   - partial failure → host keeps only the failed rows selected.
 *   - all failed      → host leaves the selection untouched.
 * The grid itself is expected to re-fetch (e.g. `hook.refresh()`) inside
 * `onSuccess` when at least one row succeeded — that naturally drops the
 * deleted rows and leaves the failed ones in place, no manual row surgery
 * needed here.
 */
export function useBulkRowDelete({ apiBaseUrl, entity = 'header', token, onSuccess }) {
  const ui = useUI();
  const [pendingRows, setPendingRows] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const requestBulkDelete = useCallback((rows) => {
    const withIds = (rows || []).filter((r) => r?.id);
    if (!withIds.length) return;
    setPendingRows(withIds);
  }, []);

  const close = useCallback(() => {
    if (deleting) return;
    setPendingRows(null);
  }, [deleting]);

  const confirm = useCallback(async () => {
    if (!pendingRows?.length || !apiBaseUrl) return;
    setDeleting(true);
    try {
      const results = await Promise.allSettled(
        pendingRows.map((row) =>
          fetch(`${apiBaseUrl}/${entity}/${row.id}`, {
            method: 'DELETE',
            headers: buildHeaders(token),
          }).then(async (res) => {
            if (!res.ok) throw new Error(await extractErrorMessage(res, ui));
            return row;
          })
        )
      );

      const succeeded = [];
      const failed = [];
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') succeeded.push(pendingRows[idx]);
        else failed.push(pendingRows[idx]);
      });

      // ETP-4656 (Confluence design doc, grid bulk-delete outcomes) — exactly ONE
      // toast per outcome, not two stacked ones (that was the line-level pattern
      // copied from DetailView.jsx's onDelete, which is fine for that surface but
      // not what the grid spec calls for):
      //   all succeeded  -> success: "{count} deleted successfully."
      //   partial        -> warning (single combined message): "X of Y deleted. Z could not be deleted."
      //   all failed     -> error: "None of the X selected could be deleted."
      const total = pendingRows.length;
      if (failed.length === 0) {
        toast.success(ui('bulkDeleteAllSucceeded', { count: succeeded.length }));
      } else if (succeeded.length === 0) {
        toast.error(ui('bulkDeleteAllFailed', { count: total }));
      } else {
        toast.warning(ui('bulkDeletePartialFailure', {
          succeeded: succeeded.length,
          total,
          failed: failed.length,
        }));
      }

      setPendingRows(null);
      onSuccess?.(succeeded, failed);
    } finally {
      setDeleting(false);
    }
  }, [pendingRows, apiBaseUrl, entity, token, ui, onSuccess]);

  const count = pendingRows?.length ?? 0;

  const bulkDeleteDialog = (
    <Dialog
      open={Boolean(pendingRows)}
      onOpenChange={(open) => { if (!open) close(); }}
      data-testid="Dialog__bulk-delete">
      <DialogContent className="max-w-sm" data-testid="DialogContent__bulk-delete">
        <DialogHeader data-testid="DialogHeader__bulk-delete">
          <DialogTitle data-testid="DialogTitle__bulk-delete">{ui('bulkDeleteConfirmTitle')}</DialogTitle>
          <DialogDescription data-testid="DialogDescription__bulk-delete">
            {ui('bulkDeleteConfirmMessage', { count })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__bulk-delete">
          <DialogClose asChild data-testid="DialogClose__bulk-delete">
            <Button
              variant="outline"
              size="sm"
              disabled={deleting}
              data-testid="Button__bulk-delete-cancel">{ui('cancel')}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            data-testid="bulk-delete-confirm"
            onClick={confirm}
          >
            {ui('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestBulkDelete, bulkDeleteDialog, deleting };
}
