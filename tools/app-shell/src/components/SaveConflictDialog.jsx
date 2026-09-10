import { useCallback, useEffect, useState } from 'react';
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
import {
  subscribeSaveConflict,
  dismissSaveConflict,
  refreshFromSaveConflict,
  canRefreshFromSaveConflict,
} from '@/lib/saveConflict.js';

/**
 * Tells the user their save was refused because somebody else changed the record, and offers the
 * two choices (ETP-5073 / DOC-04).
 *
 * Mounted ONCE, beside the other prompts in `App.jsx`: the store it subscribes to is a
 * module-level singleton.
 *
 * Two choices and no third, cleverer one — no merge. See `discardChangesAndReload` in useEntity for
 * why re-applying the user's edits over the other person's was removed: it overwrote their value on
 * any shared field, and it injected values without running the callouts a real edit runs.
 *
 * `Cancel` is the default and the safe one, so it is what the backdrop and Escape resolve to;
 * refreshing throws work away and must be chosen deliberately.
 */
export function SaveConflictDialog() {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [canRefresh, setCanRefresh] = useState(false);

  useEffect(() => subscribeSaveConflict((next) => {
    // Snapshotted as the dialog opens: the store's pending entry is cleared on close, so reading
    // it during a later render would report false.
    if (next) setCanRefresh(canRefreshFromSaveConflict());
    setOpen(next);
  }), []);

  const handleRefresh = useCallback(() => refreshFromSaveConflict(), []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) dismissSaveConflict(); }}
      data-testid="Dialog__save-conflict">
      <DialogContent className="sm:max-w-lg" data-testid="save-conflict-dialog">
        <DialogHeader data-testid="DialogHeader__save-conflict">
          <DialogTitle data-testid="DialogTitle__save-conflict">
            {ui('saveConflictTitle')}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__save-conflict">
            {ui('saveConflictRecordChanged')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__save-conflict">
          <Button
            variant="outline"
            onClick={dismissSaveConflict}
            data-testid="save-conflict-cancel">
            {ui('saveConflictKeepEditing')}
          </Button>
          {canRefresh && (
            <Button
              variant="destructive"
              onClick={handleRefresh}
              data-testid="save-conflict-refresh">
              {ui('saveConflictDiscardAndReload')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SaveConflictDialog;
