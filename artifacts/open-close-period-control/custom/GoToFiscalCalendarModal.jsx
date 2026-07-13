import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.jsx';

/**
 * GoToFiscalCalendarModal — cross-window navigation confirmation for the
 * Periods (open-close-period-control) window's "more" menu.
 *
 * Periods are provisioned by the Fiscal Calendar window (creating a new
 * fiscal Year there also generates its Periods via the "Create Periods"
 * classic process). This window intentionally has `hideCreate: true` — new
 * periods are never created here — so users who need a new fiscal year
 * must be routed to `/fiscal-calendar` instead.
 *
 * There is no generic decisions.json-level "navigate to another window"
 * menuAction primitive in the pipeline today (only `component` opening a
 * modal, `action`/`documentAction`/`columnName` triggering a process).
 * This component reuses the `component` slot to render a small
 * confirmation dialog whose confirm button navigates via `useNavigate()`
 * instead of performing a POST — the simplest option that fits the
 * existing menuActions mechanism without changing the generator.
 *
 * Props (matches the standard menuActions `component` contract):
 *   isOpen  — boolean, controls Dialog open state
 *   onClose — () => void
 */
export default function GoToFiscalCalendarModal({ isOpen, onClose }) {
  const ui = useUI();
  const navigate = useNavigate();

  const handleConfirm = () => {
    onClose?.();
    navigate('/fiscal-calendar');
  };

  const handleOpenChange = (open) => {
    if (!open) onClose?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} data-testid="Dialog__gotofiscalcalendar">
      <DialogContent className="max-w-sm" data-testid="go-to-fiscal-calendar-modal">
        <DialogHeader data-testid="DialogHeader__gotofiscalcalendar">
          <DialogTitle
            className="text-lg font-semibold text-[#121217]"
            data-testid="DialogTitle__gotofiscalcalendar">
            {ui('goToFiscalCalendar')}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[#5C5E64]" data-testid="go-to-fiscal-calendar-body">
          {ui('goToFiscalCalendarBody')}
        </p>

        <DialogFooter className="gap-2 pt-2" data-testid="DialogFooter__gotofiscalcalendar">
          <button
            type="button"
            data-testid="go-to-fiscal-calendar-cancel"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#121217] bg-white border border-[#D1D4DB] rounded-full shadow-sm hover:bg-[#F9FAFB] transition-colors"
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            data-testid="go-to-fiscal-calendar-confirm"
            onClick={handleConfirm}
            className="px-5 py-2 text-sm font-medium text-white bg-[#121217] rounded-full hover:bg-[#28282F] transition-colors"
          >
            {ui('goToFiscalCalendar')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
