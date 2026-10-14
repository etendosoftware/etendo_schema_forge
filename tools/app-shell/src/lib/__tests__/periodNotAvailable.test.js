// @covers tools/app-shell/src/lib/periodNotAvailable.js
// ETP-5577 — the action a "period not open" refusal toast offers.
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodNotAvailableToastOptions,
  periodRecoveryFor,
  setPeriodRecovery,
} from '../periodNotAvailable.js';

const ui = (key) => `t:${key}`;

describe('periodNotAvailableToastOptions', () => {
  afterEach(() => setPeriodRecovery(null));

  it('sends the owner to First Steps while the calendar review is pending', () => {
    const visited = [];
    setPeriodRecovery(periodRecoveryFor({ pending: true, isOwner: true }, (path) => visited.push(path)));
    const { action } = periodNotAvailableToastOptions(['PeriodNotAvailable'], ui);
    assert.equal(action.label, 't:periodNotAvailableReviewCalendar');
    action.onClick();
    assert.deepEqual(visited, ['/first-steps']);
  });

  it('tells anyone else to ask the owner while the review is pending', () => {
    setPeriodRecovery(periodRecoveryFor({ pending: true, isOwner: false }, () => {}));
    assert.deepEqual(periodNotAvailableToastOptions(['PeriodNotAvailable'], ui),
      { description: 't:periodNotAvailableAskOwner' });
  });

  it('sends to Calendar once the review is done', () => {
    const visited = [];
    setPeriodRecovery(periodRecoveryFor({ pending: false, isOwner: true }, (path) => visited.push(path)));
    const { action } = periodNotAvailableToastOptions(['PeriodNotAvailable'], ui);
    assert.equal(action.label, 't:periodNotAvailableOpenCalendar');
    action.onClick();
    assert.deepEqual(visited, ['/calendar']);
  });

  it('adds nothing for another refusal, or with no layout registered', () => {
    setPeriodRecovery(periodRecoveryFor({ pending: false }, () => {}));
    assert.deepEqual(periodNotAvailableToastOptions(['OtherPostingProcessActive'], ui), {});
    assert.deepEqual(periodNotAvailableToastOptions(undefined, ui), {});
    setPeriodRecovery(null);
    assert.deepEqual(periodNotAvailableToastOptions(['PeriodNotAvailable'], ui), {});
  });
});
