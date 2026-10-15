/**
 * ETP-5577 — the First Steps row "Revisar calendario contable".
 *
 * Shown only when the backend says the tenant must review its calendar (`required`, a per-tenant
 * marker), done when it says the calendar is `reviewed`. Never a persisted checklist id.
 *
 * @covers tools/app-shell/src/pages/first-steps/calendarReviewStep.js
 * @covers tools/app-shell/src/pages/first-steps/firstStepsConfig.js
 */
import {
  CALENDAR_REVIEW_STEP,
  NO_CALENDAR_REVIEW,
  calendarReviewStepState,
  withCalendarReviewStep,
} from '../calendarReviewStep.js';
import { NO_DEMO_DATA_TRANSFER, demoDataTransferStepState } from '../demoDataTransferStep.js';
import {
  FIRST_STEPS,
  PLAN_PRODUCTIVE,
  areAllStepsDone,
  countCompletedSteps,
  findExpandedStepId,
  firstStepsTotal,
  isStepDone,
  toggleableStepIds,
  visibleFirstSteps,
} from '../firstStepsConfig.js';

const REQUIRED = calendarReviewStepState({ required: true, reviewed: false });
const REVIEWED = calendarReviewStepState({ required: true, reviewed: true });

describe('calendarReviewStep — no review required', () => {
  it('keeps the row out of the static catalogue', () => {
    expect(FIRST_STEPS.map((step) => step.id)).not.toContain(CALENDAR_REVIEW_STEP.id);
  });

  it('maps a missing or not-required answer to the hidden state', () => {
    expect(calendarReviewStepState(undefined)).toBe(NO_CALENDAR_REVIEW);
    expect(calendarReviewStepState({ required: false, reviewed: false })).toBe(NO_CALENDAR_REVIEW);
    expect(visibleFirstSteps(PLAN_PRODUCTIVE, NO_DEMO_DATA_TRANSFER, NO_CALENDAR_REVIEW))
      .toBe(FIRST_STEPS);
  });
});

describe('calendarReviewStep — review required', () => {
  it('splices the row right after the fiscal step on a productive tenant', () => {
    const ids = visibleFirstSteps(PLAN_PRODUCTIVE, NO_DEMO_DATA_TRANSFER, REQUIRED)
      .map((step) => step.id);
    expect(ids.indexOf('calendar-review')).toBe(ids.indexOf('fiscal-config') + 1);
    expect(firstStepsTotal(PLAN_PRODUCTIVE, NO_DEMO_DATA_TRANSFER, REQUIRED)).toBe(8);
  });

  it('sits before the transfer row when both are shown', () => {
    const transfer = demoDataTransferStepState({ available: true, status: 'RUNNING' });
    const ids = visibleFirstSteps(PLAN_PRODUCTIVE, transfer, REQUIRED).map((step) => step.id);
    expect(ids.slice(2, 5)).toEqual(['fiscal-config', 'calendar-review', 'demo-data-transfer']);
  });

  it('never shows it to a trial tenant', () => {
    expect(visibleFirstSteps('free', NO_DEMO_DATA_TRANSFER, REQUIRED).map((step) => step.id))
      .not.toContain('calendar-review');
  });

  it('appends it when the anchor step is missing rather than dropping it', () => {
    expect(withCalendarReviewStep([{ id: 'a' }], REQUIRED, true).map((step) => step.id))
      .toEqual(['a', 'calendar-review']);
  });

  it('is done only when the server says reviewed, whatever the checklist ticks say', () => {
    expect(isStepDone(CALENDAR_REVIEW_STEP, ['calendar-review'], NO_DEMO_DATA_TRANSFER, REQUIRED))
      .toBe(false);
    expect(isStepDone(CALENDAR_REVIEW_STEP, [], NO_DEMO_DATA_TRANSFER, REVIEWED)).toBe(true);
  });

  it('counts toward progress and the all-set state', () => {
    const allTicked = toggleableStepIds(PLAN_PRODUCTIVE);
    expect(countCompletedSteps([], PLAN_PRODUCTIVE, NO_DEMO_DATA_TRANSFER, REVIEWED)).toBe(2);
    expect(areAllStepsDone(allTicked, PLAN_PRODUCTIVE, NO_DEMO_DATA_TRANSFER, REQUIRED))
      .toBe(false);
    expect(areAllStepsDone(allTicked, PLAN_PRODUCTIVE, NO_DEMO_DATA_TRANSFER, REVIEWED))
      .toBe(true);
  });

  it('opens on the review once the steps before it are done', () => {
    expect(findExpandedStepId(['company-data', 'fiscal-config'], PLAN_PRODUCTIVE,
      NO_DEMO_DATA_TRANSFER, REQUIRED)).toBe('calendar-review');
  });

  it('is never a toggleable, persisted id', () => {
    expect(toggleableStepIds(PLAN_PRODUCTIVE)).not.toContain('calendar-review');
  });
});
