// @covers tools/app-shell/src/windows/custom/product/productSidebarPeriod.js
import { describe, it, expect } from 'vitest';
import {
  computePeriodRange,
  formatPeriodRange,
  DEFAULT_SIDEBAR_PERIOD,
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
