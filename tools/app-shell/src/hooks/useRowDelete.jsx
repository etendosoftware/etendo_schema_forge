import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { extractErrorMessage } from '@/hooks/useEntity';

/**
 * Row-level delete with the same styled confirm modal DetailView uses
 * (ui('deleteConfirmTitle') / ui('deleteConfirmMessage') / Dialog primitive).
 *
 * Returns:
 *   - requestDelete(row): opens the dialog for that row — wire as `onDelete` on RowQuickActions.
 *   - deleteDialog: JSX node the host must render once (e.g. before its modals/portals).
 *
 * On confirm: DELETE ${apiBaseUrl}/${entity}/${row.id} → toast + onSuccess refresh.
 *
 * `deleteFn` (optional): overrides the network call for windows where a plain DELETE
 * isn't always the right request (e.g. a processed record needs a dedicated removal
 * action instead). Receives the pending row, must throw on failure — the dialog keeps
 * its shared copy/styling either way.
 */
export function useRowDelete({ apiBaseUrl, entity = 'header', token, onSuccess, deleteFn }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const requestDelete = useCallback((row) => {
    if (!row?.id) return;
    setPending(row);
  }, []);

  const close = useCallback(() => {
    if (deleting) return;
    setPending(null);
  }, [deleting]);

  const confirm = useCallback(async () => {
    if (!pending?.id || !apiBaseUrl) return;
    setDeleting(true);
    try {
      if (deleteFn) {
        await deleteFn(pending);
      } else {
        const res = await apiFetch(`/${entity}/${pending.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const msg = await extractErrorMessage(res, ui);
          throw new Error(msg || `${res.status} ${res.statusText}`);
        }
      }
      toast.success(ui('recordDeleted'));
      setPending(null);
      onSuccess?.();
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
      // Close the dialog on failure too — the toast already communicates the
      // error, so leaving the confirm popup open on top of it is confusing
      // (standardized delete behavior, ETP-4656).
      setPending(null);
    } finally {
      setDeleting(false);
    }
  }, [pending, apiBaseUrl, entity, apiFetch, onSuccess, ui, deleteFn]);

  const deleteDialog = (
    <Dialog
      open={Boolean(pending)}
      onOpenChange={(open) => { if (!open) close(); }}
      data-testid="Dialog__ab22b5">
      <DialogContent className="max-w-sm" data-testid="DialogContent__ab22b5">
        <DialogHeader data-testid="DialogHeader__ab22b5">
          <DialogTitle data-testid="DialogTitle__ab22b5">{ui('deleteConfirmTitle')}</DialogTitle>
          <DialogDescription data-testid="DialogDescription__ab22b5">{ui('deleteConfirmMessage')}</DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__ab22b5">
          <DialogClose asChild data-testid="DialogClose__ab22b5">
            <Button
              variant="outline"
              size="sm"
              disabled={deleting}
              data-testid="Button__ab22b5">{ui('cancel')}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            data-testid="row-quick-action-delete-confirm"
            onClick={confirm}
          >
            {ui('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestDelete, deleteDialog };
}
