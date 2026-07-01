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
 * Row-level delete with the same styled confirm modal DetailView uses
 * (ui('deleteConfirmTitle') / ui('deleteConfirmMessage') / Dialog primitive).
 *
 * Returns:
 *   - requestDelete(row): opens the dialog for that row — wire as `onDelete` on RowQuickActions.
 *   - deleteDialog: JSX node the host must render once (e.g. before its modals/portals).
 *
 * On confirm: DELETE ${apiBaseUrl}/${entity}/${row.id} → toast + onSuccess refresh.
 */
export function useRowDelete({ apiBaseUrl, entity = 'header', token, onSuccess }) {
  const ui = useUI();
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
      const res = await fetch(`${apiBaseUrl}/${entity}/${pending.id}`, {
        method: 'DELETE',
        headers: buildHeaders(token),
      });
      if (res.ok) {
        toast.success(ui('recordDeleted'));
        setPending(null);
        onSuccess?.();
      } else {
        const msg = await extractErrorMessage(res, ui);
        toast.error(msg || `${res.status} ${res.statusText}`);
      }
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setDeleting(false);
    }
  }, [pending, apiBaseUrl, entity, token, onSuccess, ui]);

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
