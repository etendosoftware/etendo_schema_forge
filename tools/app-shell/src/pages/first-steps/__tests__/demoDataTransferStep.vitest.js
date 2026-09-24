/**
 * ETP-5443 — the First Steps row owned by flag `demo-data-transfer`.
 *
 * The flag is evaluated by the backend only; the browser learns it from whether
 * `GET /sws/go/demo-data-transfer` answered (`available`). These specs pin the one thing that
 * must hold with the flag OFF: the catalogue is exactly the pre-ETP-5364 one.
 */
import {
  DEMO_DATA_TRANSFER_STEP,
  NO_DEMO_DATA_TRANSFER,
  demoDataTransferStepState,
  isDemoDataTransferTerminal,
  withDemoDataTransferStep,
} from '../demoDataTransferStep.js';
import {
  FIRST_STEPS,
  PLAN_PRODUCTIVE,
  firstStepsTotal,
  toggleableStepIds,
  visibleFirstSteps,
} from '../firstStepsConfig.js';

describe('demoDataTransferStep — flag off', () => {
  it('keeps the transfer row out of the static catalogue', () => {
    expect(FIRST_STEPS.map((step) => step.id)).not.toContain(DEMO_DATA_TRANSFER_STEP.id);
  });

  it('leaves the visible list untouched without a transfer state', () => {
    expect(visibleFirstSteps(PLAN_PRODUCTIVE)).toBe(FIRST_STEPS);
    expect(firstStepsTotal(PLAN_PRODUCTIVE)).toBe(7);
  });

  it('maps a missing or unavailable hook state to the flag-off state', () => {
    expect(demoDataTransferStepState(undefined)).toBe(NO_DEMO_DATA_TRANSFER);
    expect(demoDataTransferStepState({ available: false, status: 'RUNNING' }))
      .toBe(NO_DEMO_DATA_TRANSFER);
  });
});

describe('demoDataTransferStep — flag on', () => {
  const on = (status) => demoDataTransferStepState({ available: true, status });

  it('splices the row right after the fiscal step on a productive tenant', () => {
    const ids = visibleFirstSteps(PLAN_PRODUCTIVE, on('RUNNING')).map((step) => step.id);
    expect(ids.indexOf('demo-data-transfer')).toBe(ids.indexOf('fiscal-config') + 1);
    expect(firstStepsTotal(PLAN_PRODUCTIVE, on('RUNNING'))).toBe(8);
  });

  it('never shows it to a trial tenant', () => {
    expect(visibleFirstSteps('free', on('RUNNING')).map((step) => step.id))
      .not.toContain('demo-data-transfer');
  });

  it('appends it when the anchor step is missing rather than dropping it', () => {
    const steps = [{ id: 'a' }];
    expect(withDemoDataTransferStep(steps, on('RUNNING'), true).map((step) => step.id))
      .toEqual(['a', 'demo-data-transfer']);
  });

  it('is never a toggleable, persisted id', () => {
    expect(toggleableStepIds(PLAN_PRODUCTIVE)).not.toContain('demo-data-transfer');
  });

  it('counts COMPLETED, SKIPPED and NOT_REQUESTED as done, RUNNING and FAILED as pending', () => {
    for (const status of ['COMPLETED', 'SKIPPED', 'NOT_REQUESTED']) {
      expect(isDemoDataTransferTerminal(status)).toBe(true);
      expect(on(status).done).toBe(true);
    }
    for (const status of ['RUNNING', 'FAILED', 'LOADING']) {
      expect(on(status).done).toBe(false);
    }
  });
});
