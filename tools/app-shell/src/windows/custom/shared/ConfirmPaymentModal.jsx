import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';

/* eslint-disable react/prop-types */

export default function ConfirmPaymentModal({ dir, onConfirm, onClose }) {
  const ui = useUI();
  const isIn = dir === 'in';

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      data-testid="Dialog__confirm-payment">
      <DialogContent className="max-w-sm" data-testid="DialogContent__confirm-payment">
        <DialogHeader data-testid="DialogHeader__confirm-payment">
          <DialogTitle data-testid="DialogTitle__confirm-payment">
            {ui(isIn ? 'confirmarCobroTitle' : 'confirmarPagoTitle')}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__confirm-payment">
            {ui(isIn ? 'confirmarCobroBody' : 'confirmarPagoBody')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__confirm-payment">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            data-testid="Button__confirm-payment-cancel">
            {ui('cancel')}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onConfirm}
            data-testid="payment-confirm-action">
            {ui('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
