import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getDueDateState,
  getDueDateDotStyle,
  getDueDateTextStyle,
  getLatestInstallmentDueDate,
} from '../invoiceDueDate.js';

describe('invoiceDueDate helpers', () => {
  describe('getLatestInstallmentDueDate', () => {
    it('returns the latest due date across installments', () => {
      const dueDate = getLatestInstallmentDueDate([
        { dueDate: '2026-04-27' },
        { dueDate: '2026-04-29' },
        { dueDate: '2026-04-28' },
      ]);

      assert.equal(dueDate?.getFullYear(), 2026);
      assert.equal(dueDate?.getMonth(), 3);
      assert.equal(dueDate?.getDate(), 29);
    });

    it('keeps UTC midnight payloads on the original calendar day', () => {
      const dueDate = getLatestInstallmentDueDate([
        { dueDate: '2026-04-27T00:00:00Z' },
        { dueDate: '2026-04-28T00:00:00Z' },
      ]);

      assert.equal(dueDate?.getFullYear(), 2026);
      assert.equal(dueDate?.getMonth(), 3);
      assert.equal(dueDate?.getDate(), 28);
    });

    it('ignores invalid or missing due dates', () => {
      const dueDate = getLatestInstallmentDueDate([
        { dueDate: 'not-a-date' },
        {},
        { dueDate: '2026-04-30' },
      ]);

      assert.equal(dueDate?.getFullYear(), 2026);
      assert.equal(dueDate?.getMonth(), 3);
      assert.equal(dueDate?.getDate(), 30);
    });

    it('returns null when no installment has a valid due date', () => {
      assert.equal(getLatestInstallmentDueDate([{ dueDate: 'bad-date' }, {}]), null);
    });
  });

  describe('getDueDateState', () => {
    const today = new Date(2026, 3, 27, 15, 30, 0, 0); // 2026-04-27

    it('returns paid when outstanding is zero, regardless of past due date', () => {
      assert.equal(getDueDateState('2026-04-20', 0, today), 'paid');
    });

    it('returns paid when outstanding is zero on a future invoice', () => {
      assert.equal(getDueDateState('2026-05-30', 0, today), 'paid');
    });

    it('treats negative outstanding as paid (over-paid)', () => {
      assert.equal(getDueDateState('2026-05-30', -5, today), 'paid');
    });

    it('returns overdue when due date is in the past and outstanding > 0', () => {
      assert.equal(getDueDateState('2026-04-26', 100, today), 'overdue');
    });

    it('returns soon when the due date is today and outstanding > 0', () => {
      assert.equal(getDueDateState('2026-04-27', 100, today), 'soon');
    });

    it('returns soon when the due date is within 7 days and outstanding > 0', () => {
      assert.equal(getDueDateState('2026-05-03', 100, today), 'soon');
      assert.equal(getDueDateState('2026-05-04', 100, today), 'soon');
    });

    it('returns ok when the due date is more than 7 days away', () => {
      assert.equal(getDueDateState('2026-05-05', 100, today), 'ok');
      assert.equal(getDueDateState('2026-06-30', 100, today), 'ok');
    });

    it('falls back to ok when due date is missing', () => {
      assert.equal(getDueDateState(null, 100, today), 'ok');
      assert.equal(getDueDateState(undefined, 100, today), 'ok');
    });

    it('still returns paid when outstanding is zero and due date is missing', () => {
      assert.equal(getDueDateState(null, 0, today), 'paid');
    });
  });

  describe('color helpers (semantic theme tokens)', () => {
    it('paid uses the success token, no override on text', () => {
      assert.deepEqual(getDueDateDotStyle('paid'), { backgroundColor: 'var(--status-success-fg)' });
      assert.equal(getDueDateTextStyle('paid'), undefined);
    });

    it('overdue uses the destructive token, no override on text', () => {
      assert.deepEqual(getDueDateDotStyle('overdue'), { backgroundColor: 'hsl(var(--destructive))' });
      assert.equal(getDueDateTextStyle('overdue'), undefined);
    });

    it('soon uses the warning token, no override on text', () => {
      assert.deepEqual(getDueDateDotStyle('soon'), { backgroundColor: 'var(--status-warning-fg)' });
      assert.equal(getDueDateTextStyle('soon'), undefined);
    });

    it('ok uses the neutral token, no override on text', () => {
      assert.deepEqual(getDueDateDotStyle('ok'), { backgroundColor: 'var(--status-neutral-fg)' });
      assert.equal(getDueDateTextStyle('ok'), undefined);
    });

    it('falls back to the neutral token for an unknown state', () => {
      assert.deepEqual(getDueDateDotStyle('weird'), { backgroundColor: 'var(--status-neutral-fg)' });
    });
  });
});
