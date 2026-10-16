// @covers tools/app-shell/src/windows/custom/shared/paymentSummaryPeriod.js
import { describe, it, expect, afterEach } from 'vitest';
import { buildPeriodLabel, buildPeriodSubtitle } from '../paymentSummaryPeriod.js';

const ui = (key) => key;
const range = (originalValue, value = ['2026-10-01', '2026-10-15']) => ({ mode: 'date', op: 'range', value, originalValue });

describe('paymentSummaryPeriod', () => {
  it('labels no filter and the allTime preset as all time', () => {
    expect(buildPeriodLabel(null, ui)).toBe('dateRangeAllTime');
    expect(buildPeriodLabel(undefined, ui)).toBe('dateRangeAllTime');
    expect(buildPeriodLabel(range('preset:allTime'), ui)).toBe('dateRangeAllTime');
  });

  it('labels a preset with the shared date-range popover label', () => {
    expect(buildPeriodLabel(range('preset:last7'), ui)).toBe('dateRangeLast7Days');
    expect(buildPeriodLabel(range('preset:today'), ui)).toBe('dateRangeToday');
  });

  it('formats a custom range as dd/mm/yyyy – dd/mm/yyyy', () => {
    expect(buildPeriodLabel(range('custom:2026-10-01:2026-10-15'), ui)).toBe('01/10/2026 – 15/10/2026');
  });

  it('falls back to all time for a filter without a usable range', () => {
    expect(buildPeriodLabel(range(null, []), ui)).toBe('dateRangeAllTime');
  });

  it('appends the row count with the direction noun', () => {
    expect(buildPeriodSubtitle(null, 3, 'in', ui)).toBe('dateRangeAllTime · 3 cobrosNoun');
    expect(buildPeriodSubtitle(range('preset:last30'), 0, 'out', ui)).toBe('dateRangeLast30Days · 0 pagosNoun');
  });

  it.each([
    ['today', 'dateRangeToday'],
    ['yesterday', 'dateRangeYesterday'],
    ['last7', 'dateRangeLast7Days'],
    ['last30', 'dateRangeLast30Days'],
    ['last12m', 'dateRangeLast12Months'],
    ['allTime', 'dateRangeAllTime'],
  ])('labels the %s preset with %s', (id, key) => {
    expect(buildPeriodLabel(range(`preset:${id}`), ui)).toBe(key);
  });

  it('falls back to all time for an unknown preset id', () => {
    expect(buildPeriodLabel(range('preset:nextCentury'), ui)).toBe('dateRangeAllTime');
  });

  it('builds a custom range from value[] even when originalValue is missing', () => {
    const f = { mode: 'date', op: 'range', value: ['2026-01-05', '2026-12-31'] };
    expect(buildPeriodLabel(f, ui)).toBe('05/01/2026 – 31/12/2026');
  });

  it('falls back to all time when only one bound is present', () => {
    expect(buildPeriodLabel({ value: ['2026-01-05', null] }, ui)).toBe('dateRangeAllTime');
    expect(buildPeriodLabel({ value: 'nope' }, ui)).toBe('dateRangeAllTime');
  });

  it('picks the cobros or pagos noun key per direction', () => {
    expect(buildPeriodSubtitle(null, 1, 'in', ui)).toBe('dateRangeAllTime · 1 cobrosNoun');
    expect(buildPeriodSubtitle(null, 1, 'out', ui)).toBe('dateRangeAllTime · 1 pagosNoun');
  });

  describe('time zone', () => {
    const original = process.env.TZ;
    afterEach(() => {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    });

    it.each(['America/Argentina/Buenos_Aires', 'Pacific/Auckland', 'UTC'])(
      'does not shift calendar days under %s',
      (tz) => {
        process.env.TZ = tz;
        expect(buildPeriodLabel(range('custom:2026-10-01:2026-10-15'), ui)).toBe('01/10/2026 – 15/10/2026');
      },
    );
  });
});
