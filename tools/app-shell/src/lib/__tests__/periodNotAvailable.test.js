// @covers tools/app-shell/src/lib/periodNotAvailable.js
// ETP-5577 — the action a "period not open" refusal toast offers.
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarPathForDate,
  documentPeriodDate,
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

  it('sends an owner who dismissed First Steps to Calendar, the row being unreachable', async () => {
    const visited = [];
    setPeriodRecovery(periodRecoveryFor({ pending: true, isOwner: true, firstStepsDismissed: true },
      (path) => visited.push(path)));
    const { action } = periodNotAvailableToastOptions(['PeriodNotAvailable'], ui);
    assert.equal(action.label, 't:periodNotAvailableOpenCalendar');
    await action.onClick();
    assert.deepEqual(visited, ['/calendar']);
  });

  it('sends to Calendar once the review is done', async () => {
    const visited = [];
    setPeriodRecovery(periodRecoveryFor({ pending: false, isOwner: true }, (path) => visited.push(path)));
    const { action } = periodNotAvailableToastOptions(['PeriodNotAvailable'], ui);
    assert.equal(action.label, 't:periodNotAvailableOpenCalendar');
    await action.onClick();
    assert.deepEqual(visited, ['/calendar']);
  });

  it('offers "Ir al calendario" for PeriodNotValid too, alone or among other keys', () => {
    setPeriodRecovery(periodRecoveryFor({ pending: false }, () => {}));
    for (const keys of [['PeriodNotValid'], ['Other', 'PeriodNotValid']]) {
      assert.equal(periodNotAvailableToastOptions(keys, ui).action.label,
        't:periodNotAvailableOpenCalendar');
    }
  });

  it('adds nothing for another refusal, or with no layout registered', () => {
    setPeriodRecovery(periodRecoveryFor({ pending: false }, () => {}));
    assert.deepEqual(periodNotAvailableToastOptions(['OtherPostingProcessActive'], ui), {});
    assert.deepEqual(periodNotAvailableToastOptions(undefined, ui), {});
    setPeriodRecovery(null);
    assert.deepEqual(periodNotAvailableToastOptions(['PeriodNotAvailable'], ui), {});
  });
});

// A July-June calendar: fiscal 2026 runs Jul 2026-Jun 2027, fiscal 2027 Jul 2027-Jun 2028.
const JULY_JUNE = [
  { year: 'Y2026', startingDate: '2026-07-01', endingDate: '2026-07-31' },
  { year: 'Y2026', startingDate: '2027-01-01', endingDate: '2027-01-31' },
  { year: 'Y2026', startingDate: '2027-06-01', endingDate: '2027-06-30' },
  { year: 'Y2027', startingDate: '2027-07-01', endingDate: '2027-07-31' },
  { year: 'Y2027', startingDate: '2027-12-01', endingDate: '2027-12-31' },
];

describe('calendarPathForDate', () => {
  it('opens the fiscal year whose PERIOD contains the date, not the one named like its year', () => {
    assert.equal(calendarPathForDate(JULY_JUNE, '2027-01-15'), '/calendar/Y2026');
    assert.equal(calendarPathForDate(JULY_JUNE, '2027-06-30'), '/calendar/Y2026');
    assert.equal(calendarPathForDate(JULY_JUNE, '2027-07-01'), '/calendar/Y2027');
    assert.equal(calendarPathForDate(JULY_JUNE, '2027-12-31T10:00:00'), '/calendar/Y2027');
  });

  it('falls back to Calendar with no date, no period for it, or no periods', () => {
    assert.equal(calendarPathForDate(JULY_JUNE, null), '/calendar');
    assert.equal(calendarPathForDate(JULY_JUNE, '2030-03-01'), '/calendar');
    assert.equal(calendarPathForDate(undefined, '2027-01-15'), '/calendar');
  });
});

describe('the "Ir al calendario" action with a document date', () => {
  afterEach(() => setPeriodRecovery(null));

  it('opens the year of the refused document', async () => {
    const visited = [];
    setPeriodRecovery(periodRecoveryFor({ pending: false }, (path) => visited.push(path),
      async () => JULY_JUNE));
    const { action } = periodNotAvailableToastOptions(['PeriodNotAvailable'], ui,
      { date: '2027-01-15' });
    await action.onClick();
    assert.deepEqual(visited, ['/calendar/Y2026']);
  });

  it('still reaches Calendar when the periods cannot be read', async () => {
    const visited = [];
    setPeriodRecovery(periodRecoveryFor({ pending: false }, (path) => visited.push(path),
      async () => { throw new Error('offline'); }));
    await periodNotAvailableToastOptions(['PeriodNotAvailable'], ui, { date: '2027-01-15' })
      .action.onClick();
    assert.deepEqual(visited, ['/calendar']);
  });

  it('reads the date the period check reads, per document kind', () => {
    assert.equal(documentPeriodDate({ accountingDate: '2027-01-15', invoiceDate: '2026-12-31' }),
      '2027-01-15');
    assert.equal(documentPeriodDate({ movementDate: '2027-02-01' }), '2027-02-01');
    assert.equal(documentPeriodDate({ paymentDate: '2027-03-01' }), '2027-03-01');
    assert.equal(documentPeriodDate(null), null);
  });

  it('goes to the Calendar list, without throwing, on a malformed or absent date', async () => {
    for (const date of ['not-a-date', '2027-13-45x', '', undefined, null]) {
      const visited = [];
      setPeriodRecovery(periodRecoveryFor({ pending: false }, (path) => visited.push(path),
        async () => JULY_JUNE));
      await periodNotAvailableToastOptions(['PeriodNotValid'], ui, { date }).action.onClick();
      assert.deepEqual(visited, ['/calendar'], String(date));
    }
  });
});
