import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * GoToFiscalCalendarButton — always-visible navigation entry point to the
 * Fiscal Calendar window from the Periods (open-close-period-control) list.
 *
 * Periods are provisioned by the Fiscal Calendar window (creating a new
 * fiscal Year there also generates its Periods via the "Create Periods"
 * classic process). This window intentionally has `hideCreate: true` — new
 * periods are never created here — so users who need a new fiscal year
 * must be routed to `/fiscal-calendar` instead.
 *
 * Wired via `window.listKpiCards.customComponent`, which renders this
 * component as `headerContent` above the list table — it requires no
 * selected/open record, unlike the row-level `menuActions` entry that was
 * previously the only way to reach this link.
 *
 * Props: standard `headerContent` props from `ListView` (`api`, `token`,
 * `apiBaseUrl`, `items`, `loading`) — none are needed here.
 */
export default function GoToFiscalCalendarButton() {
  const ui = useUI();
  const navigate = useNavigate();

  return (
    <div className="flex justify-end pb-3">
      <button
        type="button"
        data-testid="go-to-fiscal-calendar-button"
        onClick={() => navigate('/fiscal-calendar')}
        className="h-9 flex items-center gap-1.5 px-3 rounded-lg border border-[#D1D4DB] bg-white text-sm font-medium text-[#121217] hover:bg-[#F5F7F9] transition-colors"
      >
        <CalendarDays className="h-4 w-4 text-[#828FA3]" data-testid="CalendarDays__gotofiscalcalendar" />
        {ui('goToFiscalCalendar')}
      </button>
    </div>
  );
}
