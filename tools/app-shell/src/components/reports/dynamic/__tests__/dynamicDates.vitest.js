// @covers tools/app-shell/src/components/reports/dynamic/dynamicDates.js
import {
  comparisonPeriod, matchingShortcut, openingPeriod, pickedYearPeriod, previousPeriod,
  samePeriodLastYear, shortcutPeriod, yearContaining,
} from '../dynamicDates.js';

const JULY_CALENDAR = [
  { id: 'Y27', name: '2027', startDate: '2027-07-01', endDate: '2028-06-30' },
  { id: 'Y26', name: '2026', startDate: '2026-07-01', endDate: '2027-06-30' },
  { id: 'Y25', name: '2025', startDate: '2025-07-01', endDate: '2026-06-30' },
];

// §19 G3: the day arithmetic must hold east and west of UTC (no toISOString shift).
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

for (const tz of ['Europe/Madrid', 'America/Argentina/Buenos_Aires']) {
  describe(`dynamicDates [${tz}]`, () => {
    beforeAll(() => { process.env.TZ = tz; });

    it('runs in that zone', () => {
      expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(tz === 'Europe/Madrid' ? -60 : 180);
    });

    it('opens on the fiscal year that contains today, up to today (July calendar)', () => {
      expect(openingPeriod(JULY_CALENDAR, '2026-11-03')).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-11-03', yearId: 'Y26', noFiscalYear: false });
      expect(openingPeriod(JULY_CALENDAR, '2026-06-30').yearId).toBe('Y25');
    });

    it('no year for today, or no calendar: 1 January to today, flagged', () => {
      expect(openingPeriod([], '2026-11-03')).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-11-03', yearId: null, noFiscalYear: true });
      expect(openingPeriod(JULY_CALENDAR, '2030-02-01').noFiscalYear).toBe(true);
    });

    it('ignores a year without bounds', () => {
      expect(yearContaining([{ id: 'X', startDate: '', endDate: '' }], '2026-11-03')).toBeNull();
    });

    it('a year picked by hand: a closed one fills its range, the current one stops at today', () => {
      expect(pickedYearPeriod(JULY_CALENDAR[2], '2026-11-03')).toEqual({ dateFrom: '2025-07-01', dateTo: '2026-06-30' });
      expect(pickedYearPeriod(JULY_CALENDAR[1], '2026-11-03')).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-11-03' });
    });

    it('month, quarter and last 12 months end today', () => {
      expect(shortcutPeriod('month', '2026-11-03')).toEqual({ dateFrom: '2026-11-01', dateTo: '2026-11-03' });
      expect(shortcutPeriod('quarter', '2026-11-03')).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-11-03' });
      expect(shortcutPeriod('quarter', '2026-03-31').dateFrom).toBe('2026-01-01');
      expect(shortcutPeriod('last12', '2026-11-03')).toEqual({ dateFrom: '2025-11-04', dateTo: '2026-11-03' });
      expect(shortcutPeriod('last12', '2026-12-31').dateFrom).toBe('2026-01-01');
    });

    it('names the shortcut a period matches', () => {
      expect(matchingShortcut({ dateFrom: '2026-07-01', dateTo: '2026-11-03' }, JULY_CALENDAR, '2026-11-03')).toBe('year');
      expect(matchingShortcut({ dateFrom: '2026-10-01', dateTo: '2026-11-03' }, JULY_CALENDAR, '2026-11-03')).toBe('quarter');
      expect(matchingShortcut({ dateFrom: '2026-10-02', dateTo: '2026-11-03' }, JULY_CALENDAR, '2026-11-03')).toBeNull();
      expect(matchingShortcut({ dateFrom: '2026-11-01', dateTo: '2026-11-02' }, JULY_CALENDAR, '2026-11-03')).toBeNull();
    });

    it('same period last year: each bound one calendar year back, 29 February → 28', () => {
      expect(samePeriodLastYear({ dateFrom: '2026-07-01', dateTo: '2026-11-03' })).toEqual({ fromReferenceDate: '2025-07-01', toReferenceDate: '2025-11-03' });
      expect(samePeriodLastYear({ dateFrom: '2028-02-01', dateTo: '2028-02-29' })).toEqual({ fromReferenceDate: '2027-02-01', toReferenceDate: '2027-02-28' });
    });

    it('previous period: same number of days, ending the day before', () => {
      expect(previousPeriod({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })).toEqual({ fromReferenceDate: '2026-08-31', toReferenceDate: '2026-09-30' });
      // Across the March DST change: still whole days.
      expect(previousPeriod({ dateFrom: '2026-04-01', dateTo: '2026-04-10' })).toEqual({ fromReferenceDate: '2026-03-22', toReferenceDate: '2026-03-31' });
      expect(previousPeriod({ dateFrom: '2026-01-01', dateTo: '2026-01-01' })).toEqual({ fromReferenceDate: '2025-12-31', toReferenceDate: '2025-12-31' });
    });

    it('comparisonPeriod: none, or no dates, is null', () => {
      expect(comparisonPeriod('', { dateFrom: '2026-01-01', dateTo: '2026-01-31' })).toBeNull();
      expect(comparisonPeriod('previous', { dateFrom: '', dateTo: '2026-01-31' })).toBeNull();
      expect(comparisonPeriod('same-last-year', { dateFrom: '2026-01-01', dateTo: '2026-01-31' }).fromReferenceDate).toBe('2025-01-01');
    });
  });
}
