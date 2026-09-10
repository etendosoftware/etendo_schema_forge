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
  subscribeNavigationPrompt,
  confirmPendingNavigation,
  cancelPendingNavigation,
  savePendingNavigation,
  canSaveUnsavedChanges,
} from '@/lib/unsavedChanges.js';

/**
 * Asks to save or discard before an in-app navigation throws unsaved changes away
 * (ETP-5073 / DOC-08).
 *
 * Mounted ONCE, next to `LocaleChangeConfirmDialog` in `App.jsx`: the gate it subscribes to is a
 * module-level singleton, so a second host would fight the first for the same pending navigation.
 *
 * Three answers, deliberately — the ticket asks for "save or discard", and cancel is what makes
 * the other two safe to offer:
 *
 * - **Save and continue** — only when every dirty form registered a saver. A save can still be
 *   refused by validation; then the navigation is dropped and the user stays on the form with the
 *   error visible.
 * - **Discard and continue** — the explicit version of what used to happen silently.
 * - **Cancel** — stay put, keep the changes.
 */
export function UnsavedChangesNavigationDialog() {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Snapshotted when the prompt opens: while it is up no form can register or clear a saver, and
  // reading it during render would re-query a module singleton on every unrelated re-render.
  const [canSave, setCanSave] = useState(false);

  useEffect(() => subscribeNavigationPrompt((next) => {
    if (next) setCanSave(canSaveUnsavedChanges());
    setOpen(next);
    if (!next) setSaving(false);
  }), []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    // The gate closes the prompt itself, whether the save succeeded or was refused.
    await savePendingNavigation();
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) cancelPendingNavigation(); }}
      data-testid="Dialog__unsaved-navigation">
      <DialogContent className="sm:max-w-md" data-testid="unsaved-navigation-dialog">
        <DialogHeader data-testid="DialogHeader__unsaved-navigation">
          <DialogTitle data-testid="DialogTitle__unsaved-navigation">
            {ui('unsavedNavigationTitle')}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__unsaved-navigation">
            {ui('unsavedNavigationBody')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__unsaved-navigation">
          <Button
            variant="outline"
            onClick={cancelPendingNavigation}
            disabled={saving}
            data-testid="unsaved-navigation-cancel">
            {ui('cancel')}
          </Button>
          <Button
            variant="outline"
            onClick={confirmPendingNavigation}
            disabled={saving}
            data-testid="unsaved-navigation-discard">
            {ui('unsavedNavigationDiscardAction')}
          </Button>
          {canSave && (
            <Button
              onClick={handleSave}
              disabled={saving}
              data-testid="unsaved-navigation-save">
              {saving ? ui('saving') : ui('unsavedNavigationSaveAction')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UnsavedChangesNavigationDialog;
