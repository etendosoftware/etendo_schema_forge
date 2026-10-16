/**
 * ETP-5577 — the First Steps row "Revisar calendario contable" for productive tenants, which are
 * onboarded with every accounting period never-opened.
 *
 * Like the demo data transfer row, it is NOT part of `FIRST_STEPS`: it is spliced in only when
 * `GET /sws/go/onboarding/calendar-review` answers `required: true`. `required` comes from a
 * per-tenant marker written at onboarding: tenants onboarded before ETP-5577, whose periods were
 * opened then, never have it and never see the row.
 *
 * The row has no checkbox: it is done when the server says the calendar is `reviewed` (the owner
 * confirmed or regenerated it, or a period was opened, or something was already posted). The
 * state is per environment, unlike the checklist ticks, which are per account.
 */

/** The review state the catalogue assumes whenever the backend has not asked for a review. */
export const NO_CALENDAR_REVIEW = Object.freeze({ available: false, done: false });

/** The id of the step the review row is rendered after. */
const INSERT_AFTER_STEP_ID = 'fiscal-config';

/** Fiscal year start options the backend accepts, in calendar order. */
export const FISCAL_YEAR_STARTS = Object.freeze(['JANUARY', 'APRIL', 'JULY', 'OCTOBER']);

/** Where the user opens the periods they want once the calendar is settled. */
export const CALENDAR_PERIODS_PATH = '/calendar';

export const CALENDAR_REVIEW_STEP = Object.freeze({
  id: 'calendar-review',
  iconName: 'CalendarCheck',
  titleKey: 'firstStepsCalendarReview',
  descKey: 'firstStepsCalendarReviewDesc',
  minutes: 2,
  action: 'calendarReview',
  to: null,
  importSpec: null,
  keepActionWhenDone: true,
  productiveOnly: true,
  gateQuestionKey: null,
  alwaysDone: false,
});

/** Collapses the hook's state into what the catalogue needs: is the row shown, is it done. */
export function calendarReviewStepState(review) {
  if (!review?.required) return NO_CALENDAR_REVIEW;
  return { available: true, done: Boolean(review.reviewed) };
}

/**
 * Returns `steps` with the review row spliced in right after the fiscal step, or `steps`
 * unchanged when no review is required or the plan hides productive-only rows.
 */
export function withCalendarReviewStep(steps, reviewState, productive) {
  if (!reviewState?.available || !productive) return steps;
  const anchor = steps.findIndex((step) => step.id === INSERT_AFTER_STEP_ID);
  const at = anchor < 0 ? steps.length : anchor + 1;
  return [...steps.slice(0, at), CALENDAR_REVIEW_STEP, ...steps.slice(at)];
}
