import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';

/**
 * Modal that edits an attachment's description.
 *
 * Props:
 *   open       - Whether the dialog is visible.
 *   attachment - Attachment object whose description we are editing.
 *   onClose    - () => void. Called on cancel or after a successful save.
 *   onSave     - (description: string) => void.
 */
export default function EditDescriptionDialog({ open, attachment, onClose, onSave }) {
  const ui = useUI();
  const [description, setDescription] = useState('');

  // Reset the local state every time the dialog opens with a different record.
  useEffect(() => {
    if (open) {
      setDescription(attachment?.description ?? '');
    }
  }, [open, attachment]);

  const handleSave = () => {
    onSave?.(description);
    onClose?.();
  };

  const handleKeyDown = (event) => {
    // Cmd/Ctrl + Enter submits.
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!value) onClose?.(); }}
      data-testid="Dialog__5db62a">
      <DialogContent data-testid="DialogContent__5db62a">
        <DialogHeader data-testid="DialogHeader__5db62a">
          <DialogTitle data-testid="DialogTitle__5db62a">{ui('attachmentsEditDescription')}</DialogTitle>
        </DialogHeader>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={ui('attachmentsDescriptionPlaceholder')}
        />
        <DialogFooter data-testid="DialogFooter__5db62a">
          <Button
            type="button"
            variant="outline"
            onClick={() => onClose?.()}
            data-testid="Button__5db62a">
            {ui('cancel')}
          </Button>
          <Button type="button" onClick={handleSave} data-testid="Button__5db62a">
            {ui('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
