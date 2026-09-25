import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { presetBounds, getDateBounds, toDateParam } from '../dateRangeBounds.js';
import { todayCalendarISO } from '../dateOnly.js';

/**
 * Fixes both the process timezone and the wall clock for the duration of `fn`, then restores
 * both regardless of how `fn` exits.
 *
 * `presetBounds()` calls `new Date()` with no arguments, so asserting its output for a specific
 * instant/timezone combination requires controlling both: TZ alone changes how a Date's local
 * getters read a fixed timestamp, but `new Date()` would still capture the real wall clock.
 *
 * @param {string} tz - IANA timezone name, e.g. 'America/Argentina/Buenos_Aires'.
 * @param {number} nowEpochMs - the fixed "current instant", as a UTC epoch in milliseconds.
 * @param {() => void} fn
 */
function withFixedClock(tz, nowEpochMs, fn) {
  const originalTZ = process.env.TZ;
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(nowEpochMs);
      } else {
        super(...args);
      }
    }
    static now() {
      return nowEpochMs;
    }
  }
  process.env.TZ = tz;
  global.Date = FixedDate;
  try {
    fn();
  } finally {
    global.Date = RealDate;
    process.env.TZ = originalTZ;
  }
}

describe('dateRangeBounds helpers', () => {
  describe('presetBounds', () => {
    it('returns start-of-today..end-of-today for "today"', () => {
      const { from, to } = presetBounds('today');
      const today = new Date();
      assert.equal(from.getHours(), 0);
      assert.equal(from.getMinutes(), 0);
      assert.equal(to.getHours(), 23);
      assert.equal(to.getMinutes(), 59);
      assert.equal(to.getSeconds(), 59);
      assert.equal(to.getMilliseconds(), 999);
      assert.equal(from.getDate(), today.getDate());
      assert.equal(to.getDate(), today.getDate());
    });

    it('shifts both bounds back one day for "yesterday"', () => {
      const { from, to } = presetBounds('yesterday');
      const ref = new Date();
      ref.setHours(0, 0, 0, 0);
      ref.setDate(ref.getDate() - 1);
      assert.equal(from.getDate(), ref.getDate());
      assert.equal(to.getDate(), ref.getDate());
      assert.equal(to.getHours(), 23);
    });

    it('spans 7 calendar days (today - 6) for "last7"', () => {
      const { from, to } = presetBounds('last7');
      const ref = new Date();
      ref.setHours(0, 0, 0, 0);
      ref.setDate(ref.getDate() - 6);
      assert.equal(from.getTime(), ref.getTime());
      const expectedTo = new Date();
      expectedTo.setHours(23, 59, 59, 999);
      assert.equal(to.getTime(), expectedTo.getTime());
    });

    it('spans 30 calendar days (today - 29) for "last30"', () => {
      const { from } = presetBounds('last30');
      const ref = new Date();
      ref.setHours(0, 0, 0, 0);
      ref.setDate(ref.getDate() - 29);
      assert.equal(from.getTime(), ref.getTime());
    });

    it('goes back 12 months for "last12m"', () => {
      const { from } = presetBounds('last12m');
      const ref = new Date();
      ref.setHours(0, 0, 0, 0);
      ref.setMonth(ref.getMonth() - 12);
      assert.equal(from.getTime(), ref.getTime());
    });

    it('returns null for an unknown preset', () => {
      assert.equal(presetBounds('all-time'), null);
      assert.equal(presetBounds(undefined), null);
    });
  });

  describe('getDateBounds', () => {
    it('returns null bounds for a falsy range', () => {
      assert.deepEqual(getDateBounds(null), { from: null, to: null });
      assert.deepEqual(getDateBounds(undefined), { from: null, to: null });
    });

    it('delegates to presetBounds for a presetId range', () => {
      const direct = presetBounds('last7');
      const viaRange = getDateBounds({ presetId: 'last7' });
      assert.equal(viaRange.from.getTime(), direct.from.getTime());
      assert.equal(viaRange.to.getTime(), direct.to.getTime());
    });

    it('returns null bounds for an unknown presetId', () => {
      assert.deepEqual(getDateBounds({ presetId: 'nope' }), { from: null, to: null });
    });

    it('normalizes explicit from/to Dates to day start/end', () => {
      const from = new Date(2026, 0, 10, 9, 30, 15, 123);
      const to = new Date(2026, 0, 20, 9, 30, 15, 123);
      const bounds = getDateBounds({ from, to });
      assert.equal(bounds.from.getHours(), 0);
      assert.equal(bounds.from.getMinutes(), 0);
      assert.equal(bounds.to.getHours(), 23);
      assert.equal(bounds.to.getMilliseconds(), 999);
      // Does not mutate the originals (copies are made).
      assert.equal(from.getHours(), 9);
      assert.equal(to.getHours(), 9);
    });

    it('tolerates non-Date members in an explicit range', () => {
      const bounds = getDateBounds({ from: 'x', to: null });
      assert.equal(bounds.from, null);
      assert.equal(bounds.to, null);
    });
  });

  describe('toDateParam', () => {
    it('formats a valid Date as ISO yyyy-mm-dd', () => {
      assert.equal(toDateParam(new Date('2026-03-04T12:00:00Z')), '2026-03-04');
    });

    it('returns undefined for an invalid Date', () => {
      assert.equal(toDateParam(new Date('not-a-date')), undefined);
    });

    it('returns undefined for a non-Date value', () => {
      assert.equal(toDateParam(null), undefined);
      assert.equal(toDateParam('2026-03-04'), undefined);
      assert.equal(toDateParam(undefined), undefined);
    });

    describe('ETP-5449 — presetBounds() composed with toDateParam across timezones', () => {
      it('keeps both ends of "yesterday" on the same local calendar day under UTC-3', () => {
        // Buenos Aires is fixed at UTC-3 (no DST). Fix "now" to 2026-09-24T15:00:00 local
        // (= 2026-09-24T18:00:00Z).
        const nowEpochMs = Date.UTC(2026, 8, 24, 18, 0, 0);
        withFixedClock('America/Argentina/Buenos_Aires', nowEpochMs, () => {
          const { from, to } = presetBounds('yesterday');
          const fromParam = toDateParam(from);
          const toParam = toDateParam(to);
          assert.equal(fromParam, toParam, 'from and to of "yesterday" must be the same day');
          // One day before local "today" (2026-09-24). Before the fix, `to` — local
          // 2026-09-23T23:59:59.999 — serialized via toISOString() as
          // "2026-09-24T02:59:59.999Z", so toDateParam(to) wrongly returned "2026-09-24"
          // ("today"), which is why the "Ayer" filter silently included today's rows too.
          assert.equal(toParam, '2026-09-23');
        });
      });

      it('keeps "today" from rolling into tomorrow under UTC-3', () => {
        const nowEpochMs = Date.UTC(2026, 8, 24, 18, 0, 0); // 2026-09-24T15:00 local
        withFixedClock('America/Argentina/Buenos_Aires', nowEpochMs, () => {
          const { to } = presetBounds('today');
          // `to` is local 2026-09-24T23:59:59.999 = 2026-09-25T02:59:59.999Z. The old
          // toISOString()-based implementation reported "2026-09-25".
          assert.equal(toDateParam(to), '2026-09-24');
        });
      });

      it('keeps "today" from rolling back a day under UTC+2', () => {
        // Madrid observes CEST (UTC+2) in September. Fix "now" to 2026-09-24T08:00:00
        // local (= 2026-09-24T06:00:00Z).
        const nowEpochMs = Date.UTC(2026, 8, 24, 6, 0, 0);
        withFixedClock('Europe/Madrid', nowEpochMs, () => {
          const { from } = presetBounds('today');
          // `from` is local 2026-09-24T00:00:00 = 2026-09-23T22:00:00Z. The old
          // toISOString()-based implementation reported "2026-09-23" — one day early.
          assert.equal(toDateParam(from), '2026-09-24');
        });
      });
    });

    it('never disagrees with todayCalendarISO on the calendar day of the same instant', () => {
      // Fixed non-UTC timezone so a UTC-based regression in toDateParam would actually surface
      // as a mismatch here, instead of accidentally agreeing because TZ === UTC.
      const originalTZ = process.env.TZ;
      process.env.TZ = 'America/Argentina/Buenos_Aires';
      try {
        const instants = [
          new Date(2026, 0, 15, 23, 30, 0), // late evening
          new Date(2026, 5, 1, 0, 15, 0), // just after local midnight
          new Date(2026, 8, 24, 15, 0, 0), // mid-afternoon (the ETP-5449 reference instant)
          new Date(2026, 11, 31, 12, 0, 0), // safe noon, year-end boundary
        ];
        for (const instant of instants) {
          assert.equal(toDateParam(instant), todayCalendarISO(instant));
        }
      } finally {
        process.env.TZ = originalTZ;
      }
    });
  });
});
