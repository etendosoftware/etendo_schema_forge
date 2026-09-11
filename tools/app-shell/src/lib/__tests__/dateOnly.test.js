import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarISODaysAgo,
  formatCalendarDate,
  formatCalendarMonthYear,
  getCalendarDateRelation,
  parseCalendarDate,
  todayCalendarISO,
  tomorrowCalendarISO,
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

  describe('formatCalendarMonthYear', () => {
    it('expands persisted English period names to a full localized month and two-digit year', () => {
      assert.equal(formatCalendarMonthYear('2027-01-01', 'en_US'), 'January 27');
    });

    it('expands persisted Spanish period names to a full localized month and two-digit year', () => {
      assert.equal(formatCalendarMonthYear('2027-01-01', 'es_ES'), 'Enero 27');
    });

    it('uses the starting date year for fiscal years that cross from July through June', () => {
      assert.equal(formatCalendarMonthYear('2028-06-01', 'en_US'), 'June 28');
      assert.equal(formatCalendarMonthYear('2028-06-01', 'es_ES'), 'Junio 28');
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

  // ETP-5017: introduced alongside the "payments due" card, which needs "on or
  // before today" expressed as `< tomorrow` since date-mode filters have no
  // `lessOrEqual` operator.
  describe('tomorrowCalendarISO', () => {
    it('formats the day after a normal reference date', () => {
      assert.equal(tomorrowCalendarISO(new Date(2026, 7, 5, 12, 0, 0)), '2026-08-06');
    });

    it('rolls over the month at the end of January', () => {
      assert.equal(tomorrowCalendarISO(new Date(2026, 0, 31, 12, 0, 0)), '2026-02-01');
    });

    it('rolls over the year at the end of December', () => {
      assert.equal(tomorrowCalendarISO(new Date(2026, 11, 31, 12, 0, 0)), '2027-01-01');
    });

    it('handles the leap-day rollover in a leap year (2028-02-28 → 2028-02-29)', () => {
      assert.equal(tomorrowCalendarISO(new Date(2028, 1, 28, 12, 0, 0)), '2028-02-29');
    });

    it('does not drift to the UTC day for a late local evening', () => {
      // 2026-08-25 23:30 local is already 2026-08-26 in UTC; "tomorrow" from the
      // local calendar day must still be the 26th, not the 27th.
      assert.equal(tomorrowCalendarISO(new Date(2026, 7, 25, 23, 30, 0)), '2026-08-26');
    });
  });

  // ETP-5181: introduced for the PSD2 "Importar desde" advisory, which needs the
  // earliest date a provider will serve ("today − max_fetch_interval") as a
  // `yyyy-MM-dd` bound it can compare lexicographically against the stored
  // date-only field. Every case passes an explicit `reference` so the assertions
  // never depend on the wall clock.
  describe('calendarISODaysAgo', () => {
    it('subtracts whole days from a mid-month reference', () => {
      // 2026 is not a leap year: 2026-08-05 is day 217, and day 217 − 90 = 127 = May 7.
      assert.equal(calendarISODaysAgo(90, new Date(2026, 7, 5, 12, 0, 0)), '2026-05-07');
    });

    it('rolls back over a month boundary', () => {
      assert.equal(calendarISODaysAgo(1, new Date(2026, 2, 1, 12, 0, 0)), '2026-02-28');
    });

    it('rolls back over a year boundary', () => {
      assert.equal(calendarISODaysAgo(10, new Date(2026, 0, 5, 12, 0, 0)), '2025-12-26');
    });

    it('lands on the leap day when stepping back into a leap February', () => {
      assert.equal(calendarISODaysAgo(1, new Date(2028, 2, 1, 12, 0, 0)), '2028-02-29');
    });

    it('counts the extra leap day when spanning a leap February', () => {
      // 2028 IS a leap year: 2028-05-01 is day 122, and day 122 − 90 = 32 = Feb 1.
      // A run that ignored the leap day would answer 2028-02-02.
      assert.equal(calendarISODaysAgo(90, new Date(2028, 4, 1, 12, 0, 0)), '2028-02-01');
    });

    it('does not drift to the UTC day for a late local evening', () => {
      // Same concern the todayCalendarISO block above guards: 2026-08-25 23:30 local is
      // already 2026-08-26 in UTC, so a `toISOString().slice(0, 10)` route (or a
      // `getTime() - days * 86400000` one, which inherits the same UTC framing) would
      // count back from the 26th and answer 2026-05-28. The local calendar day is the
      // 25th, so 90 days earlier is the 27th.
      assert.equal(calendarISODaysAgo(90, new Date(2026, 7, 25, 23, 30, 0)), '2026-05-27');
    });

    it('does not drift to the previous UTC day for an early local morning', () => {
      assert.equal(calendarISODaysAgo(90, new Date(2026, 7, 25, 0, 30, 0)), '2026-05-27');
    });

    it('returns the reference day itself for zero days', () => {
      assert.equal(calendarISODaysAgo(0, new Date(2026, 7, 25, 23, 30, 0)), '2026-08-25');
    });

    it('pads single-digit month and day', () => {
      assert.equal(calendarISODaysAgo(2, new Date(2026, 0, 5, 12, 0, 0)), '2026-01-03');
    });
  });
});
