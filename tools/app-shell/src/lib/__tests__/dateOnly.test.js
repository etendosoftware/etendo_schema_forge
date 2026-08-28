import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCalendarDate,
  getCalendarDateRelation,
  parseCalendarDate,
  todayCalendarISO,
} from '../dateOnly.js';

describe('dateOnly helpers', () => {
  describe('parseCalendarDate', () => {
    it('parses YYYY-MM-DD as a local calendar date', () => {
      const date = parseCalendarDate('2026-04-27');
      assert.equal(date?.getFullYear(), 2026);
      assert.equal(date?.getMonth(), 3);
      assert.equal(date?.getDate(), 27);
    });

    it('keeps midnight UTC date-only payloads on the same calendar day', () => {
      const date = parseCalendarDate('2026-04-27T00:00:00Z');
      assert.equal(date?.getFullYear(), 2026);
      assert.equal(date?.getMonth(), 3);
      assert.equal(date?.getDate(), 27);
    });

    it('returns null for invalid input', () => {
      assert.equal(parseCalendarDate('not-a-date'), null);
    });
  });

  describe('formatCalendarDate', () => {
    it('formats date-only values without timezone drift', () => {
      assert.equal(formatCalendarDate('2026-04-27'), '27/04/2026');
    });

    it('normalizes app locale codes such as en_US before formatting', () => {
      assert.equal(formatCalendarDate('2026-04-27', 'en_US'), '04/27/2026');
    });

    it('returns an em dash when the input is empty', () => {
      assert.equal(formatCalendarDate(null), '—');
    });
  });

  describe('getCalendarDateRelation', () => {
    const today = new Date(2026, 3, 27, 15, 30, 0, 0);

    it('classifies past dates', () => {
      assert.equal(getCalendarDateRelation('2026-04-26', today), 'past');
    });

    it('classifies same-day due dates as today', () => {
      assert.equal(getCalendarDateRelation('2026-04-27', today), 'today');
    });

    it('classifies future dates', () => {
      assert.equal(getCalendarDateRelation('2026-04-28', today), 'future');
    });
  });

  // ETP-5012: guards against `toISOString().slice(0, 10)`, which reads the
  // day in UTC and drifts by one day west/east of UTC near midnight.
  describe('todayCalendarISO', () => {
    it('formats a reference date as local yyyy-MM-dd', () => {
      assert.equal(todayCalendarISO(new Date(2026, 7, 5, 12, 0, 0)), '2026-08-05');
    });

    it('pads single-digit month and day', () => {
      assert.equal(todayCalendarISO(new Date(2026, 0, 3, 0, 0, 0)), '2026-01-03');
    });

    it('does not shift to the next UTC day for a late local evening', () => {
      // 2026-08-25 23:30 local is already 2026-08-26 in UTC; the local
      // calendar day must still be reported as the 25th.
      assert.equal(todayCalendarISO(new Date(2026, 7, 25, 23, 30, 0)), '2026-08-25');
    });

    it('does not shift to the previous UTC day for an early local morning', () => {
      assert.equal(todayCalendarISO(new Date(2026, 7, 25, 0, 30, 0)), '2026-08-25');
    });
  });
});
