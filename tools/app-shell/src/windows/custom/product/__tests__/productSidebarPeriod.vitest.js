// @covers tools/app-shell/src/windows/custom/product/productSidebarPeriod.js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { presetBounds } from '@/lib/dateRangeBounds.js';
import {
  computePeriodRange,
  formatPeriodRange,
  DEFAULT_SIDEBAR_PERIOD,
  periodToMovementsPreset,
  isMovementsPresetRequest,
  MOVEMENTS_TAB_KEY,
} from '../productSidebarPeriod.js';

const today = new Date(2026, 9, 23); // 2026-10-23

describe('productSidebarPeriod', () => {
  it('defaults the panel to the last 12 months', () => {
    expect(DEFAULT_SIDEBAR_PERIOD).toBe('12M');
  });

  it('formats 12M as DD/MM/AAAA - DD/MM/AAAA ending today', () => {
    expect(formatPeriodRange('12M', today)).toBe('23/10/2025 – 23/10/2026');
  });

  it('uses dd/mm/yyyy in every UI locale', () => {
    // The range no longer takes a locale: the format is fixed (RF-05).
    expect(formatPeriodRange('12M', today)).toBe('23/10/2025 – 23/10/2026');
  });

  it('zero-pads day and month below 10', () => {
    expect(formatPeriodRange('3M', new Date(2026, 4, 5))).toBe('05/02/2026 – 05/05/2026');
  });

  it('formats 3M and 6M', () => {
    expect(formatPeriodRange('3M', today)).toBe('23/07/2026 – 23/10/2026');
    expect(formatPeriodRange('6M', today)).toBe('23/04/2026 – 23/10/2026');
  });

  it('falls back to the first option for an unknown period', () => {
    expect(formatPeriodRange('XX', today)).toBe('23/07/2026 – 23/10/2026');
  });

  it('clamps the day when the target month is shorter', () => {
    const { start } = computePeriodRange(3, new Date(2026, 4, 31));
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 1, 28]);
    const leap = computePeriodRange(12, new Date(2028, 1, 29));
    expect([leap.start.getFullYear(), leap.start.getMonth(), leap.start.getDate()]).toEqual([2027, 1, 28]);
  });

  it('crosses year boundaries', () => {
    expect(formatPeriodRange('6M', new Date(2026, 0, 15))).toBe('15/07/2025 – 15/01/2026');
  });
});

// The Movements tab period presets must equal the side panel's periods, so 'Ver movimientos' can
// open the tab on the same range. 12M keeps the shared, unclamped `setMonth(-12)`: it differs from
// computePeriodRange only on 29 Feb (rolls to 1 Mar), so that day is excluded for 12M below.
describe('Movements-tab presets agree with computePeriodRange', () => {
  afterEach(() => vi.useRealTimers());
  const days = [
    [2026, 11, 3], [2026, 5, 31], [2026, 8, 31], [2026, 1, 31], [2026, 3, 31], [2026, 12, 31],
    [2028, 2, 29], [2028, 5, 31], [2027, 2, 28], [2026, 10, 30],
  ];
  const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  for (const [preset, months] of [['last3m', 3], ['last6m', 6], ['last12m', 12]]) {
    for (const day of days) {
      if (months === 12 && day[1] === 2 && day[2] === 29) continue;
      it(`${preset} on ${day.join('-')}`, () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(day[0], day[1] - 1, day[2], 12));
        const { start, end } = computePeriodRange(months, new Date(day[0], day[1] - 1, day[2]));
        const b = presetBounds(preset);
        expect(ymd(b.from)).toEqual(ymd(start));
        expect(ymd(b.to)).toEqual(ymd(end));
      });
    }
  }
});

describe('panel period -> Movements preset (ETP-5908 batch E)', () => {
  it.each([['3M', 'last3m'], ['6M', 'last6m'], ['12M', 'last12m']])('%s -> %s', (period, preset) => {
    expect(periodToMovementsPreset(period)).toBe(preset);
    expect(isMovementsPresetRequest(preset)).toBe(true);
  });
  it('unknown periods map to null and are not valid requests', () => {
    expect(periodToMovementsPreset('1M')).toBeNull();
    expect(periodToMovementsPreset(undefined)).toBeNull();
    expect(isMovementsPresetRequest('last7')).toBe(false);
    expect(isMovementsPresetRequest(null)).toBe(false);
  });
  it('targets the key DetailView gives the movements custom tab', () => {
    expect(MOVEMENTS_TAB_KEY).toBe('custom:movements');
  });
});
