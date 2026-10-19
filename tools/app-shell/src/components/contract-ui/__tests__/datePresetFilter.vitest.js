// @covers tools/app-shell/src/components/contract-ui/datePresetFilter.js
import { computePresetRange, buildDatePresetFilter, toIsoDate } from '../datePresetFilter.js';

const NOW = new Date(2026, 9, 16, 15, 30); // 16 Oct 2026, local

describe('datePresetFilter', () => {
  it('last30 spans 30 local days ending today', () => {
    expect(buildDatePresetFilter('last30', NOW)).toEqual({
      mode: 'date',
      op: 'range',
      value: ['2026-09-17', '2026-10-16'],
      originalValue: 'preset:last30',
    });
  });

  it('computes the other presets from the given day', () => {
    const iso = (id) => { const r = computePresetRange(id, NOW); return [toIsoDate(r.from), toIsoDate(r.to)]; };
    expect(iso('today')).toEqual(['2026-10-16', '2026-10-16']);
    expect(iso('yesterday')).toEqual(['2026-10-15', '2026-10-15']);
    expect(iso('last7')).toEqual(['2026-10-10', '2026-10-16']);
    expect(iso('last12m')).toEqual(['2025-10-16', '2026-10-16']);
  });

  it('allTime and unknown ids mean no date filter', () => {
    expect(computePresetRange('allTime', NOW)).toBeNull();
    expect(buildDatePresetFilter('allTime', NOW)).toBeNull();
    expect(buildDatePresetFilter('nope', NOW)).toBeNull();
  });

  it('toIsoDate rejects invalid input', () => {
    expect(toIsoDate(new Date('x'))).toBe('');
    expect(toIsoDate(null)).toBe('');
  });
});
