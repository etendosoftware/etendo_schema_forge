// @covers tools/app-shell/src/components/reports/dynamic/dynamicDates.js
import {
  comparedRanges, comparisonPeriod, compareDates, compareRulesOf, endShortcutDate, fiscalYearStart, ledgerStartFor, matchingEndShortcut, priorFiscalYearEnd, matchingShortcut, matchingYear, openingPeriod, periodBuckets, pickedYearPeriod,
  previousCalendarBucket, previousPeriod, samePeriodLastYear, serializePeriods, shortcutPeriod, yearContaining,
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

    it('names the year a period is exactly, for the year selector', () => {
      const today = '2026-11-03';
      expect(matchingYear({ dateFrom: '2025-07-01', dateTo: '2026-06-30' }, JULY_CALENDAR, today)?.id).toBe(JULY_CALENDAR[2].id);
      expect(matchingYear({ dateFrom: '2026-07-01', dateTo: today }, JULY_CALENDAR, today)?.id).toBe(JULY_CALENDAR[1].id);
      expect(matchingYear({ dateFrom: '2026-07-01', dateTo: '2026-10-31' }, JULY_CALENDAR, today)).toBeNull();
      expect(matchingYear({ dateFrom: '2026-11-01', dateTo: today }, JULY_CALENDAR, today)).toBeNull();
      expect(matchingYear({ dateFrom: '2026-07-01', dateTo: today }, undefined, today)).toBeNull();
    });

    it('month and quarter end today; there is no rolling 12-month shortcut', () => {
      expect(shortcutPeriod('month', '2026-11-03')).toEqual({ dateFrom: '2026-11-01', dateTo: '2026-11-03' });
      expect(shortcutPeriod('quarter', '2026-11-03')).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-11-03' });
      expect(shortcutPeriod('quarter', '2026-03-31').dateFrom).toBe('2026-01-01');
      expect(() => shortcutPeriod('last12', '2026-11-03')).toThrow(/Unknown period shortcut/);
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

    it('D2: the February month end maps to the February month end, both ways', () => {
      const sly = (dateFrom, dateTo) => samePeriodLastYear({ dateFrom, dateTo });
      expect(sly('2024-02-01', '2024-02-29')).toEqual({ fromReferenceDate: '2023-02-01', toReferenceDate: '2023-02-28' });
      expect(sly('2025-02-01', '2025-02-28')).toEqual({ fromReferenceDate: '2024-02-01', toReferenceDate: '2024-02-29' });
      expect(sly('2021-01-01', '2021-02-28').toReferenceDate).toBe('2020-02-29');
      expect(sly('2024-02-28', '2024-02-28').toReferenceDate).toBe('2023-02-28');
    });

    it('D2: ordinary days (and a mid-February day) move back exactly one year', () => {
      const sly = (d) => samePeriodLastYear({ dateFrom: d, dateTo: d }).fromReferenceDate;
      expect(sly('2026-03-31')).toBe('2025-03-31');
      expect(sly('2024-02-15')).toBe('2023-02-15');
      expect(sly('2024-03-01')).toBe('2023-03-01');
      expect(sly('2025-12-31')).toBe('2024-12-31');
    });

    it('periodBuckets: Jan to Dec by month is 12 whole months after the range', () => {
      const { buckets, hiddenCount, total } = periodBuckets({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }, 'month');
      expect(buckets).toHaveLength(13);
      expect(buckets[0]).toMatchObject({ idx: 0, dateFrom: '2026-01-01', dateTo: '2026-12-31', partial: false });
      expect(buckets.slice(1).map((b) => [b.idx, b.dateFrom, b.dateTo, b.partial])).toEqual(
        Array.from({ length: 12 }, (_, m) => {
          const mm = String(m + 1).padStart(2, '0');
          const last = new Date(2026, m + 1, 0).getDate();
          return [m + 1, `2026-${mm}-01`, `2026-${mm}-${last}`, false];
        }),
      );
      expect(hiddenCount).toBe(0);
      expect(total).toEqual({ sly: buckets[0].sly, prev: buckets[0].prev });
    });

    it('periodBuckets: Q1 to Q4 by quarter', () => {
      const { buckets } = periodBuckets({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }, 'quarter');
      expect(buckets.slice(1).map((b) => [b.dateFrom, b.dateTo, b.partial])).toEqual([
        ['2026-01-01', '2026-03-31', false], ['2026-04-01', '2026-06-30', false],
        ['2026-07-01', '2026-09-30', false], ['2026-10-01', '2026-12-31', false],
      ]);
    });

    it('periodBuckets: a range starting mid-month clips the first and last bucket and flags them partial', () => {
      const { buckets } = periodBuckets({ dateFrom: '2026-03-15', dateTo: '2026-05-20' }, 'month');
      expect(buckets.slice(1).map((b) => [b.dateFrom, b.dateTo, b.partial])).toEqual([
        ['2026-03-15', '2026-03-31', true], ['2026-04-01', '2026-04-30', false], ['2026-05-01', '2026-05-20', true],
      ]);
      const q = periodBuckets({ dateFrom: '2026-04-15', dateTo: '2026-06-30' }, 'quarter').buckets;
      expect(q).toHaveLength(2);
      expect(q[1]).toMatchObject({ dateFrom: '2026-04-15', dateTo: '2026-06-30', partial: true });
    });

    it('periodBuckets: a single day is one partial bucket; a whole month is not partial', () => {
      const one = periodBuckets({ dateFrom: '2026-03-15', dateTo: '2026-03-15' }, 'month').buckets;
      expect(one).toHaveLength(2);
      expect(one[1]).toMatchObject({ dateFrom: '2026-03-15', dateTo: '2026-03-15', partial: true });
      expect(periodBuckets({ dateFrom: '2026-03-01', dateTo: '2026-03-31' }, 'month').buckets[1].partial).toBe(false);
    });

    it('periodBuckets: total grain has only bucket 0; maxShown keeps the last N and counts the hidden', () => {
      expect(periodBuckets({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }, 'total').buckets).toHaveLength(1);
      const { buckets, hiddenCount } = periodBuckets({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }, 'month', { maxShown: 6 });
      expect(buckets.map((b) => b.idx)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(buckets[1].dateFrom).toBe('2026-07-01');
      expect(buckets[6].dateTo).toBe('2026-12-31');
      expect(hiddenCount).toBe(6);
    });

    it('D3: previousCalendarBucket clamps the day and keeps from <= to', () => {
      const prev = (dateFrom, dateTo, grain = 'month') => previousCalendarBucket({ dateFrom, dateTo }, grain);
      expect(prev('2026-03-30', '2026-03-31')).toEqual({ from: '2026-02-28', to: '2026-02-28' });
      expect(prev('2026-03-15', '2026-03-31')).toEqual({ from: '2026-02-15', to: '2026-02-28' });
      expect(prev('2026-04-15', '2026-06-30', 'quarter')).toEqual({ from: '2026-01-15', to: '2026-03-31' });
      expect(prev('2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
      expect(prev('2026-01-01', '2026-01-31')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
      expect(prev('2026-01-01', '2026-03-31', 'quarter')).toEqual({ from: '2025-10-01', to: '2025-12-31' });
    });

    it('D3: previousCalendarBucket in a leap year ends on 29 February', () => {
      expect(previousCalendarBucket({ dateFrom: '2024-03-01', dateTo: '2024-03-31' }, 'month')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
      expect(previousCalendarBucket({ dateFrom: '2024-03-30', dateTo: '2024-03-31' }, 'month')).toEqual({ from: '2024-02-29', to: '2024-02-29' });
      expect(previousCalendarBucket({ dateFrom: '2024-04-01', dateTo: '2024-06-30' }, 'quarter')).toEqual({ from: '2024-01-01', to: '2024-03-31' });
    });

    it('comparedRanges: total grain uses the day-count previous period; bucket grains the calendar bucket', () => {
      expect(comparedRanges({ dateFrom: '2026-10-01', dateTo: '2026-10-31' }, 'total')).toEqual({
        sly: { from: '2025-10-01', to: '2025-10-31' }, prev: { from: '2026-08-31', to: '2026-09-30' },
      });
      expect(comparedRanges({ dateFrom: '2026-10-01', dateTo: '2026-10-31' }, 'month')).toEqual({
        sly: { from: '2025-10-01', to: '2025-10-31' }, prev: { from: '2026-09-01', to: '2026-09-30' },
      });
      expect(comparedRanges({ dateFrom: '2025-02-01', dateTo: '2025-02-28' }, 'month').sly).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    });

    it('D3: the total compared range is [prev(first bucket).from, prev(last bucket).to] and equals the bucket ranges joined', () => {
      const { buckets, total } = periodBuckets({ dateFrom: '2026-01-15', dateTo: '2026-03-31' }, 'month');
      const [first, last] = [buckets[1], buckets[buckets.length - 1]];
      expect(total.prev).toEqual({ from: first.prev.from, to: last.prev.to });
      expect(total.prev).toEqual({ from: '2025-12-15', to: '2026-02-28' });
      // contiguous: each bucket's previous range starts the day after the one before it ends
      expect(buckets[2].prev.from).toBe('2026-01-01');
      expect(buckets[1].prev.to).toBe('2025-12-31');
    });

    it('serializePeriods: tuples from..to|sly|prev, bucket 0 first, comma separated', () => {
      const { buckets } = periodBuckets({ dateFrom: '2026-01-01', dateTo: '2026-02-28' }, 'month');
      expect(serializePeriods(buckets)).toBe([
        '2026-01-01..2026-02-28|2025-01-01..2025-02-28|2025-12-01..2026-01-31',
        '2026-01-01..2026-01-31|2025-01-01..2025-01-31|2025-12-01..2025-12-31',
        '2026-02-01..2026-02-28|2025-02-01..2025-02-28|2026-01-01..2026-01-31',
      ].join(','));
      expect(serializePeriods([])).toBe('');
    });

    it('serializePeriods carries only the shown buckets; hiddenCount is the caller\'s to send', () => {
      const { buckets, hiddenCount } = periodBuckets({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }, 'month', { maxShown: 6 });
      expect(serializePeriods(buckets).split(',')).toHaveLength(7);
      expect(hiddenCount).toBe(6);
    });

    it('comparisonPeriod: none, or no dates, is null', () => {
      expect(comparisonPeriod('', { dateFrom: '2026-01-01', dateTo: '2026-01-31' })).toBeNull();
      expect(comparisonPeriod('previous', { dateFrom: '', dateTo: '2026-01-31' })).toBeNull();
      expect(comparisonPeriod('same-last-year', { dateFrom: '2026-01-01', dateTo: '2026-01-31' }).fromReferenceDate).toBe('2025-01-01');
    });
  });
}

// ETP-6083: a balance at a date: end-date shortcuts, ledger start, one-day comparisons, all from the fiscal calendar.
describe('balance at a date (ETP-6083)', () => {
  const FY = [
    { id: 'A', startDate: '2025-04-01', endDate: '2026-03-31' },
    { id: 'B', startDate: '2026-04-01', endDate: '2027-03-31' },
  ];
  const RULES = compareRulesOf({ sly: 'sameDateLastYear', prev: 'previousFiscalYearClose' }, FY);

  it('shortcuts end on the last COMPLETED month, quarter and fiscal year', () => {
    expect(endShortcutDate('today', '2026-11-20', FY)).toBe('2026-11-20');
    expect(endShortcutDate('lastMonthEnd', '2026-11-20', FY)).toBe('2026-10-31');
    expect(endShortcutDate('lastQuarterEnd', '2026-11-20', FY)).toBe('2026-09-30');
    expect(endShortcutDate('lastMonthEnd', '2026-01-10', FY)).toBe('2025-12-31');
    expect(endShortcutDate('lastFiscalYearEnd', '2026-11-20', FY)).toBe('2026-03-31'); // never assumes 31/12
    expect(endShortcutDate('lastFiscalYearEnd', '2025-06-01', FY)).toBeNull();
    expect(matchingEndShortcut('2026-10-31', ['today', 'lastMonthEnd'], '2026-11-20', FY)).toBe('lastMonthEnd');
  });

  it('Desde is the ledger start: inside the fiscal year of Hasta, else its start', () => {
    expect(fiscalYearStart(FY, '2026-11-20')).toBe('2026-04-01');
    expect(ledgerStartFor(FY, '2026-06-15', '2026-11-20')).toBe('2026-06-15');
    expect(ledgerStartFor(FY, '2026-01-01', '2026-11-20')).toBe('2026-04-01');
    expect(ledgerStartFor(FY, '2026-12-01', '2026-11-20')).toBe('2026-04-01');
    expect(ledgerStartFor([], '', '2026-11-20')).toBe('2026-01-01'); // no calendar
  });

  it('compares one day: the same date a year back, and the close of the fiscal year before', () => {
    expect(priorFiscalYearEnd(FY, '2026-11-20')).toBe('2026-03-31');
    expect(priorFiscalYearEnd(FY, '2025-11-20')).toBeNull();
    // Beyond the defined calendar: the latest year's month and day (a 04-01 calendar closes on 31 March), not 31 December.
    expect(priorFiscalYearEnd(FY, '2028-11-20')).toBe('2028-03-31');
    expect(priorFiscalYearEnd(FY, '2028-02-10')).toBe('2027-03-31');
    expect(priorFiscalYearEnd([], '2028-02-10')).toBe('2027-12-31');
    expect(compareDates(RULES, '2026-11-20')).toEqual({ sly: '2025-11-20', prev: '2026-03-31' });
    expect(compareDates(RULES, '2024-02-29').sly).toBe('2023-02-28');
    expect(comparedRanges({ dateFrom: '2026-04-01', dateTo: '2026-11-20' }, 'total', RULES)).toEqual({
      sly: { from: '2025-11-20', to: '2025-11-20' }, prev: { from: '2026-03-31', to: '2026-03-31' },
    });
    // The P&L (no rules) keeps its period-shaped comparisons.
    expect(comparedRanges({ dateFrom: '2026-04-01', dateTo: '2026-11-20' }, 'total').sly).toEqual({ from: '2025-04-01', to: '2025-11-20' });
    // Without a prior fiscal year the prior-close comparison falls back to the previous period.
    expect(comparedRanges({ dateFrom: '2025-04-01', dateTo: '2025-11-20' }, 'total', RULES).prev.from).not.toBe('2025-11-20');
    expect(periodBuckets({ dateFrom: '2026-04-01', dateTo: '2026-11-20' }, 'total', { rules: RULES }).total.prev).toEqual({ from: '2026-03-31', to: '2026-03-31' });
  });
});
