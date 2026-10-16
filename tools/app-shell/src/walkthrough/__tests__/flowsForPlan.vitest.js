/**
 * ETP-5577 — which tours an environment is offered. The calendar tour is productive-only: a demo's
 * periods are open for the whole trial. An unknown plan fails open, like the First Steps checklist.
 *
 * @covers tools/app-shell/src/walkthrough/flows/index.js
 */
import { WALKTHROUGH_FLOWS, walkthroughFlowsForPlan } from '../flows/index.js';

const ids = (flows) => flows.map((flow) => flow.id);

describe('walkthroughFlowsForPlan', () => {
  it('offers every tour to a productive environment', () => {
    expect(walkthroughFlowsForPlan('productive')).toBe(WALKTHROUGH_FLOWS);
    expect(ids(WALKTHROUGH_FLOWS)).toContain('accounting-calendar');
  });

  it('hides the calendar tour from a demo and keeps the rest in order', () => {
    expect(ids(walkthroughFlowsForPlan('free')))
      .toEqual(ids(WALKTHROUGH_FLOWS).filter((id) => id !== 'accounting-calendar'));
  });

  it('treats an unknown plan as productive', () => {
    expect(walkthroughFlowsForPlan(null)).toBe(WALKTHROUGH_FLOWS);
    expect(walkthroughFlowsForPlan(undefined)).toBe(WALKTHROUGH_FLOWS);
  });
});
