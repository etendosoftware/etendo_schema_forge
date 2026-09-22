import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarISODaysAgo,
  formatCalendarDate,
  formatCalendarMonthYear,
  getCalendarDateRelation,
  parseCalendarDate,
  parseWallClockInstant,
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

  // ETP-5046 — the wall-clock reader. It exists because some AD config timestamps
  // are authored as a wall-clock moment in the DB server's zone and then serialized
  // with a `Z` the server never meant. Comparing such a value against a date-only
  // business field (which `parseCalendarDate` puts at LOCAL midnight) with a plain
  // `new Date(...)` puts the two operands in different reference frames, so the
  // comparison's answer changes with the viewer's timezone — that is exactly how the
  // TicketBAI adoption-date gate came to hide the send action in Europe/Madrid while
  // CI (UTC) stayed green. See `isSifEligibleByDate` in windows/custom/shared/fiscalTargets.js.
  describe('parseWallClockInstant', () => {
    // Local getters, never `toISOString()`: the whole contract is about what the
    // LOCAL clock reads, so asserting on a UTC rendering would re-introduce the very
    // frame confusion this helper removes.
    const wallClock = (date) => (date === null ? null : [
      date.getFullYear(), date.getMonth(), date.getDate(),
      date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds(),
    ]);

    describe('discards the zone designator', () => {
      // The four spellings below denote four DIFFERENT absolute instants to
      // `new Date(...)`. This helper deliberately reads only the wall clock, so all
      // four must land on the same local 14:30 — that equality IS the contract.
      const SPELLINGS = [
        ['no zone at all', '2026-01-01T14:30:00'],
        ['a Z suffix', '2026-01-01T14:30:00Z'],
        ['a lowercase z suffix', '2026-01-01T14:30:00z'],
        ['a positive offset', '2026-01-01T14:30:00+02:00'],
        ['a negative offset', '2026-01-01T14:30:00-05:00'],
        ['a colon-less offset', '2026-01-01T14:30:00+0530'],
        ['a space separator instead of T', '2026-01-01 14:30:00'],
        ['no seconds', '2026-01-01T14:30'],
        ['a Z suffix and milliseconds', '2026-01-01T14:30:00.000Z'],
      ];

      for (const [label, raw] of SPELLINGS) {
        it(`reads 14:30 local from a value with ${label}`, () => {
          assert.deepEqual(wallClock(parseWallClockInstant(raw)), [2026, 0, 1, 14, 30, 0, 0]);
        });
      }

      it('collapses every spelling onto the exact same instant', () => {
        const instants = SPELLINGS.map(([, raw]) => parseWallClockInstant(raw).getTime());
        assert.equal(new Set(instants).size, 1, 'a zone designator must not move the result');
      });

      it('does NOT agree with new Date() on a zoned value away from UTC', () => {
        // A guard against a future "simplification" back to `new Date(raw)`: the two
        // only coincide when the host happens to be UTC, which is precisely why the
        // original bug survived CI. Skipped on a UTC host, where there is nothing to
        // distinguish.
        const originalTz = process.env.TZ;
        process.env.TZ = 'Europe/Madrid';
        try {
          assert.notEqual(
            parseWallClockInstant('2026-01-01T14:30:00Z').getTime(),
            new Date('2026-01-01T14:30:00Z').getTime(),
          );
        } finally {
          if (originalTz === undefined) delete process.env.TZ;
          else process.env.TZ = originalTz;
        }
      });
    });

    describe('is timezone-independent', () => {
      const originalTz = process.env.TZ;

      // Europe/Madrid is the real client case (TicketBAI/SII/VERI*FACTU are Spanish
      // fiscal regimes) and a UTC+ host, where the pre-fix reading was wrong.
      // Buenos Aires covers the UTC- side, Kiritimati the +14 extreme, Kolkata a
      // half-hour offset, and UTC the runner's own default.
      for (const tz of [
        'UTC',
        'Europe/Madrid',
        'America/Argentina/Buenos_Aires',
        'Pacific/Kiritimati',
        'Asia/Kolkata',
      ]) {
        it(`reads the same wall clock under host TZ=${tz}`, () => {
          process.env.TZ = tz;
          try {
            assert.deepEqual(
              wallClock(parseWallClockInstant('2026-01-01T14:30:00.000Z')),
              [2026, 0, 1, 14, 30, 0, 0],
            );
            assert.deepEqual(
              wallClock(parseWallClockInstant('2026-01-01T00:00:00.000Z')),
              [2026, 0, 1, 0, 0, 0, 0],
            );
            // Year boundaries are where a one-day shift is most visible.
            assert.deepEqual(
              wallClock(parseWallClockInstant('2025-12-31T23:59:59.999Z')),
              [2025, 11, 31, 23, 59, 59, 999],
            );
          } finally {
            if (originalTz === undefined) delete process.env.TZ;
            else process.env.TZ = originalTz;
          }
        });
      }
    });

    describe('date-only input', () => {
      it('falls back to local midnight, identical to parseCalendarDate', () => {
        assert.deepEqual(wallClock(parseWallClockInstant('2026-04-27')), [2026, 3, 27, 0, 0, 0, 0]);
        assert.equal(
          parseWallClockInstant('2026-04-27').getTime(),
          parseCalendarDate('2026-04-27').getTime(),
        );
      });

      it('agrees with parseCalendarDate in every timezone', () => {
        const originalTz = process.env.TZ;
        try {
          for (const tz of ['UTC', 'Europe/Madrid', 'America/Argentina/Buenos_Aires', 'Pacific/Kiritimati']) {
            process.env.TZ = tz;
            assert.equal(
              parseWallClockInstant('2026-04-27').getTime(),
              parseCalendarDate('2026-04-27').getTime(),
              `disagreed under ${tz}`,
            );
          }
        } finally {
          if (originalTz === undefined) delete process.env.TZ;
          else process.env.TZ = originalTz;
        }
      });
    });

    describe('fractional seconds', () => {
      it('reads a single fractional digit as tenths (.5 -> 500ms), not as 5ms', () => {
        assert.equal(parseWallClockInstant('2026-01-01T14:30:00.5').getMilliseconds(), 500);
      });

      it('reads two fractional digits as hundredths (.25 -> 250ms)', () => {
        assert.equal(parseWallClockInstant('2026-01-01T14:30:00.25').getMilliseconds(), 250);
      });

      it('reads three fractional digits verbatim', () => {
        assert.equal(parseWallClockInstant('2026-01-01T14:30:00.007').getMilliseconds(), 7);
      });

      it('truncates beyond millisecond precision rather than rounding or overflowing', () => {
        assert.equal(parseWallClockInstant('2026-01-01T14:30:00.123456').getMilliseconds(), 123);
        assert.equal(parseWallClockInstant('2026-01-01T14:30:00.999999').getMilliseconds(), 999);
      });

      it('defaults to zero milliseconds when no fraction is present', () => {
        assert.equal(parseWallClockInstant('2026-01-01T14:30:00').getMilliseconds(), 0);
      });
    });

    describe('Date input', () => {
      it('returns a copy of the same instant, not the caller’s object', () => {
        const input = new Date(2026, 0, 1, 14, 30, 0, 0);
        const result = parseWallClockInstant(input);
        assert.equal(result.getTime(), input.getTime());
        assert.notEqual(result, input, 'must not hand back the caller’s Date');
      });

      it('does not let a mutation of the result leak back into the input', () => {
        const input = new Date(2026, 0, 1, 14, 30, 0, 0);
        const result = parseWallClockInstant(input);
        result.setFullYear(1999);
        assert.equal(input.getFullYear(), 2026);
      });

      it('returns null for an invalid Date', () => {
        assert.equal(parseWallClockInstant(new Date('nope')), null);
      });
    });

    describe('non-ISO and unusable input', () => {
      it('delegates a non-ISO shape to parseCalendarDate rather than inventing a parser', () => {
        assert.equal(
          parseWallClockInstant('03/05/2024').getTime(),
          parseCalendarDate('03/05/2024').getTime(),
        );
      });

      it('trims surrounding whitespace before matching', () => {
        assert.deepEqual(
          wallClock(parseWallClockInstant('  2026-01-01T14:30:00Z  ')),
          [2026, 0, 1, 14, 30, 0, 0],
        );
      });

      it('returns null for falsy input', () => {
        assert.equal(parseWallClockInstant(null), null);
        assert.equal(parseWallClockInstant(undefined), null);
        assert.equal(parseWallClockInstant(''), null);
      });

      it('returns null for unparsable garbage', () => {
        assert.equal(parseWallClockInstant('not-a-date'), null);
        assert.equal(parseWallClockInstant('tomorrow'), null);
        assert.equal(parseWallClockInstant('{}'), null);
      });

      it('rolls an out-of-range component over, exactly like the Date constructor', () => {
        // Documenting real behaviour, not endorsing it: the shape regex only checks
        // digit COUNTS, so '2026-13-45T99:99:99' matches and the local-time
        // constructor normalizes the overflow (month 13 -> next January, and so on).
        // This helper is fed AD timestamp columns, which cannot hold an impossible
        // value, so range validation belongs upstream rather than here -- but if that
        // ever changes, this assertion is where the decision must be revisited.
        const rolled = parseWallClockInstant('2026-13-45T99:99:99');
        assert.ok(rolled instanceof Date);
        assert.equal(Number.isNaN(rolled.getTime()), false);
      });
    });
  });
});
