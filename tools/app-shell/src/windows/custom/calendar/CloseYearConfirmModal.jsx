import { useEffect, useState } from 'react';
import { useUI } from '@/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog.jsx';

const CLOSED_STATUSES = new Set(['C', 'P']);
const ACTION_BY_DIRECTION = { close: 'closeYear', undo: 'undoCloseYear' };

export default function CloseYearConfirmModal({ direction, isOpen, currentRecord, token, apiBaseUrl, onClose, onSaved }) {
  const ui = useUI();
  const [allClosed, setAllClosed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentRecord?.id) return;
    fetch(`${apiBaseUrl}/calendar/periodControl?year=${currentRecord.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body) => {
        const periods = body.data ?? [];
        setAllClosed(periods.length > 0 && periods.every((p) => CLOSED_STATUSES.has(p.status)));
      });
  }, [isOpen, currentRecord?.id, apiBaseUrl, token]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const action = ACTION_BY_DIRECTION[direction];
      await fetch(`${apiBaseUrl}/calendar/year/${currentRecord.id}/action/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      onSaved?.();
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  const titleKey = direction === 'close' ? 'closeYearTitle' : 'undoCloseYearTitle';
  const bodyKey = direction === 'close' ? 'closeYearBody' : 'undoCloseYearBody';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()} data-testid="Dialog__closeyear">
      <DialogContent className="max-w-sm" data-testid="close-year-modal">
        <DialogHeader data-testid="DialogHeader__closeyear">
          <DialogTitle data-testid="DialogTitle__closeyear">{ui(titleKey)}</DialogTitle>
        </DialogHeader>
        <p className="text-sm" data-testid="close-year-body">{ui(bodyKey)}</p>
        <DialogFooter className="gap-2 pt-2" data-testid="DialogFooter__closeyear">
          <button type="button" data-testid="close-year-cancel" onClick={onClose}>{ui('cancel')}</button>
          <button
            type="button"
            data-testid="close-year-confirm"
            disabled={!allClosed || submitting}
            onClick={handleConfirm}
          >
            {ui(titleKey)}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
