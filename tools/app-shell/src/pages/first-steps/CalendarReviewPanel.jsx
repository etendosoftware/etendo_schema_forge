import { useState } from 'react';
import { toast } from 'sonner';
import { useLocaleSwitch } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLaunchWalkthrough } from '@/lib/walkthrough/useLaunchWalkthrough.js';
import { CALENDAR_PERIODS_PATH, FISCAL_YEAR_STARTS } from './calendarReviewStep.js';

/** The guided tour on opening periods and creating the next year (`flows/accounting-calendar.json`). */
const CALENDAR_FLOW_ID = 'accounting-calendar';

/** Telemetry `source` of a tour started from here (the topbar launcher reports `'launcher'`). */
const WALKTHROUGH_SOURCE = 'first_steps_calendar_review';

const BUTTON_CLASS = 'rounded-md border px-3 py-1 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/50 disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent';
const CONFLICT = 409;
const FORBIDDEN = 403;

function refusalKey(error) {
  // ETP-5782: a classified 409 other than record_in_use (retryable_conflict...) is not "in use".
  if (error?.status === CONFLICT && (!error.code || error.code === 'record_in_use')) return 'firstStepsCalendarReviewInUse';
  if (error?.status === FORBIDDEN) return 'firstStepsCalendarReviewOwnerOnly';
  return 'genericError';
}

/**
 * ETP-5577 — body of the "Revisar calendario contable" row: what the accounting calendar looks
 * like, and the two ways to settle it. "Confirmar" keeps it; "Modificar" replaces the whole
 * calendar with one fiscal year starting on the chosen quarter. Either way the user then lands
 * on Calendar to open the periods they will post in, since every period starts never-opened.
 *
 * Once reviewed, only the way to Calendar stays: the calendar is no longer replaceable from here.
 * "Ver guía" starts the Calendar tour in both states, when the tour is available.
 */
export default function CalendarReviewPanel({ review, done, ui, navigate }) {
  const { locale } = useLocaleSwitch();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(review.fiscalYearStart || FISCAL_YEAR_STARTS[0]);
  const [busy, setBusy] = useState(false);
  const { canLaunch, launch } = useLaunchWalkthrough(WALKTHROUGH_SOURCE);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
      toast.success(ui('firstStepsCalendarReviewDone'));
      navigate(CALENDAR_PERIODS_PATH);
    } catch (error) {
      toast.error(ui(refusalKey(error)));
    } finally {
      setBusy(false);
    }
  };

  const viewGuide = canLaunch(CALENDAR_FLOW_ID) && (
    <button type="button" onClick={() => launch(CALENDAR_FLOW_ID)} className={BUTTON_CLASS}
      data-testid="first-steps-calendar-review-view-guide">
      {ui('viewGuide')}
    </button>
  );

  const goToCalendar = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => navigate(CALENDAR_PERIODS_PATH)} className={BUTTON_CLASS}
        data-testid="first-steps-calendar-review-open-calendar">
        {ui('firstStepsCalendarReviewOpenCalendar')}
      </button>
      {viewGuide}
    </div>
  );

  return (
    <div className="space-y-3" data-testid="first-steps-calendar-review">
      {review.year && (
        <p className="text-xs text-foreground" data-testid="first-steps-calendar-review-summary">
          {ui('firstStepsCalendarReviewSummary', {
            year: review.year,
            start: formatCalendarDate(review.startDate, locale),
            end: formatCalendarDate(review.endDate, locale),
            count: review.periodCount,
          })}
        </p>
      )}
      {done ? goToCalendar : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => run(review.confirm)}
              className={BUTTON_CLASS} data-testid="first-steps-calendar-review-confirm">
              {ui('firstStepsCalendarReviewConfirm')}
            </button>
            <button type="button" disabled={busy || !review.canRegenerate}
              onClick={() => setEditing((current) => !current)}
              className={BUTTON_CLASS} data-testid="first-steps-calendar-review-modify">
              {ui('firstStepsCalendarReviewModify')}
            </button>
            {viewGuide}
          </div>
          {!review.canRegenerate && (
            <p className="text-xs text-muted-foreground" data-testid="first-steps-calendar-review-locked">
              {ui('firstStepsCalendarReviewInUse')}
            </p>
          )}
          {editing && review.canRegenerate && (
            <div className="space-y-2" data-testid="first-steps-calendar-review-editor">
              <p className="text-xs text-muted-foreground">{ui('firstStepsCalendarReviewModifyHint')}</p>
              <div className="flex items-center gap-2">
                <Select value={start} onValueChange={setStart} data-testid="Select__cal5577">
                  <SelectTrigger className="h-8 w-56 text-xs"
                    data-testid="first-steps-calendar-review-start">
                    <SelectValue data-testid="SelectValue__cal5577" />
                  </SelectTrigger>
                  <SelectContent data-testid="first-steps-calendar-review-start-options">
                    {FISCAL_YEAR_STARTS.map((month) => (
                      <SelectItem key={month} value={month}
                        data-testid={`first-steps-calendar-review-start-${month}`}>
                        {ui(`firstStepsCalendarReviewStart${month}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button type="button" disabled={busy} onClick={() => run(() => review.regenerate(start))}
                  className={BUTTON_CLASS} data-testid="first-steps-calendar-review-apply">
                  {ui('firstStepsCalendarReviewApply')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
