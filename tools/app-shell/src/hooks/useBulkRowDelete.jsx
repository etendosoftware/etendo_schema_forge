import { useCallback, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { extractErrorMessage } from '@/hooks/useEntity';
import { runBatchDelete, toastBatchDeleteOutcome } from '@/lib/batchDelete.js';

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
  const apiFetch = useApiFetch(apiBaseUrl);
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
      // Shared triage (Promise.allSettled + succeeded/failed partition) and
      // single-toast-per-outcome selection — see `batchDelete.js` (ETP-4656:
      // extracted once Financial Accounts / Movements / Statements needed the
      // same "select → confirm → batch delete → 3-outcome toast" pattern).
      const { succeeded, failed, errors } = await runBatchDelete(pendingRows, (row) =>
        apiFetch(`/${entity}/${row.id}`, {
          method: 'DELETE',
        }).then(async (res) => {
          if (!res.ok) {
            const err = new Error(await extractErrorMessage(res, ui));
            // ETP-5111 — the status must travel with the error. The unified delete rule stopped
            // pre-disabling the "Delete selected" button for an ineligible selection (ListView's
            // `isRowDeletable` is gone), so the toast is now the ONLY place the refusal can be
            // explained; `batchDelete.isBusinessRejection` trusts a reason only when it carries a
            // 4xx status, so without this a single-row failure degraded to a bare counter and the
            // backend's own message was discarded. Same shape as `useCreateMovement.postAction`
            // and `useStatementActions`.
            err.status = res.status;
            throw err;
          }
          return row;
        })
      );

      toastBatchDeleteOutcome(ui, { succeeded, failed, errors, total: pendingRows.length });

      setPendingRows(null);
      onSuccess?.(succeeded, failed);
    } finally {
      setDeleting(false);
    }
  }, [pendingRows, apiBaseUrl, entity, apiFetch, ui, onSuccess]);

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
