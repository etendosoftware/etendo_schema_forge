import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  localeFromUi,
  formatDashboardNumber,
  formatDashboardCompact,
  formatDashboardAxisTick,
  niceScale,
  toBezierPath,
  toBezierFillPath,
} from '../dashboardNumberFormat.js';

// NBSP (U+00A0), not a plain space — matches formatCurrency's amount/symbol separator (ETP-4314).
const NBSP = ' ';

describe('localeFromUi', () => {
  it('maps es_ES to es-ES', () => {
    assert.equal(localeFromUi('es_ES'), 'es-ES');
  });

  it('maps any other locale (including en_US) to en-US', () => {
    assert.equal(localeFromUi('en_US'), 'en-US');
  });

  it('falls back to en-US for undefined', () => {
    assert.equal(localeFromUi(undefined), 'en-US');
  });

  it('falls back to en-US for an unknown locale string', () => {
    assert.equal(localeFromUi('fr_FR'), 'en-US');
  });
});

describe('formatDashboardNumber — non-finite values', () => {
  it('coerces null to 0 (Number(null) is finite)', () => {
    assert.equal(formatDashboardNumber(null), '0');
  });

  it('returns em-dash for undefined', () => {
    assert.equal(formatDashboardNumber(undefined), '—');
  });

  it('stringifies a non-numeric string as-is', () => {
    assert.equal(formatDashboardNumber('abc'), 'abc');
  });

  it('stringifies NaN input via String()', () => {
    assert.equal(formatDashboardNumber(NaN), 'NaN');
  });

  it('formats zero with default 0 fraction digits', () => {
    assert.equal(formatDashboardNumber(0), '0');
  });
});

describe('formatDashboardCompact', () => {
  it('leaves small numbers (< 1000) unscaled, no currency', () => {
    assert.equal(formatDashboardCompact(42), '42');
  });

  it('leaves small numbers unscaled with currency', () => {
    // Delegates to formatDashboardAmount → the canonical es-ES + real-symbol
    // format (ETP-4314), not the ISO-code-prefixed en-US style.
    assert.equal(formatDashboardCompact(42, { currencyLabel: 'EUR' }), `42,00${NBSP}€`);
  });

  it('scales thousands with K suffix, no currency, no fraction (round number)', () => {
    assert.equal(formatDashboardCompact(2000), '2K');
  });

  it('scales thousands with K suffix and a fraction when not a round multiple', () => {
    const result = formatDashboardCompact(1500);
    assert.match(result, /^1\.5K$/);
  });

  it('scales millions with M suffix', () => {
    assert.equal(formatDashboardCompact(3_000_000), '3M');
  });

  it('scales millions with M suffix and currency', () => {
    // Canonical es-ES + real-symbol format (ETP-4314), scale suffix before the
    // symbol (ETP-5105: "2,00M €", not "2,00 €M").
    assert.equal(formatDashboardCompact(2_000_000, { currencyLabel: 'USD' }), `2,00M${NBSP}$`);
  });

  it('scales billions with B suffix', () => {
    assert.equal(formatDashboardCompact(4_000_000_000), '4B');
  });

  it('scales billions with B suffix and currency', () => {
    // Canonical es-ES + real-symbol format (ETP-4314), scale suffix before the
    // symbol (ETP-5105: "1,00B €", not "1,00 €B").
    assert.equal(formatDashboardCompact(1_000_000_000, { currencyLabel: 'EUR' }), `1,00B${NBSP}€`);
  });

  it('treats non-finite values as 0', () => {
    assert.equal(formatDashboardCompact('not-a-number'), '0');
  });

  it('respects a custom maxDecimals option', () => {
    const result = formatDashboardCompact(1234, { maxDecimals: 2 });
    assert.match(result, /^1\.23K$/);
  });

  it('suppresses the fraction once the compact value reaches 3 digits', () => {
    // 123456789 / 1_000_000 = 123.456789 -> abs(compact) >= 100 so hasFraction=false
    assert.equal(formatDashboardCompact(123_456_789), '123M');
  });
});

describe('formatDashboardAxisTick', () => {
  it('delegates to formatDashboardCompact with maxDecimals=1', () => {
    assert.equal(formatDashboardAxisTick(2000), '2K');
  });

  it('formats small axis values unscaled', () => {
    assert.equal(formatDashboardAxisTick(7), '7');
  });
});

describe('niceScale', () => {
  it('returns the flat 0-100 fallback for dataMax <= 0', () => {
    assert.deepEqual(niceScale(0), { niceMax: 100, ticks: [0, 25, 50, 75, 100] });
  });

  it('returns the flat 0-100 fallback for negative dataMax', () => {
    assert.deepEqual(niceScale(-5), { niceMax: 100, ticks: [0, 25, 50, 75, 100] });
  });

  it('produces a nice max that is >= dataMax', () => {
    const { niceMax } = niceScale(83);
    assert.ok(niceMax >= 83);
  });

  it('produces a tick count between 4 and 6 inclusive', () => {
    const { ticks } = niceScale(83);
    assert.ok(ticks.length >= 4 && ticks.length <= 6);
  });

  it('ticks start at 0 and end at niceMax', () => {
    const { niceMax, ticks } = niceScale(4200);
    assert.equal(ticks[0], 0);
    assert.equal(ticks[ticks.length - 1], niceMax);
  });

  it('handles a very large dataMax', () => {
    const { niceMax, ticks } = niceScale(9_876_543);
    assert.ok(niceMax >= 9_876_543);
    assert.ok(ticks.length >= 4);
  });

  it('handles a very small fractional dataMax', () => {
    const { niceMax, ticks } = niceScale(0.42);
    assert.ok(niceMax >= 0.42);
    assert.ok(ticks.length >= 4);
  });
});

describe('toBezierPath', () => {
  it('returns an empty string for an empty points array', () => {
    assert.equal(toBezierPath([]), '');
  });

  it('returns a single moveto for a single point', () => {
    assert.equal(toBezierPath([{ x: 5, y: 10 }]), 'M 5,10');
  });

  it('builds a cubic bezier segment for two points', () => {
    const d = toBezierPath([{ x: 0, y: 0 }, { x: 10, y: 5 }]);
    assert.match(d, /^M 0,0 C /);
    assert.match(d, /10,5$/);
  });

  it('chains multiple C segments for 3+ points', () => {
    const d = toBezierPath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]);
    const segmentCount = (d.match(/C /g) || []).length;
    assert.equal(segmentCount, 2);
  });
});

describe('toBezierFillPath', () => {
  it('returns an empty string for an empty points array', () => {
    assert.equal(toBezierFillPath([], 100), '');
  });

  it('closes the fill path down to baseY and back to the first x', () => {
    const d = toBezierFillPath([{ x: 0, y: 0 }, { x: 10, y: 5 }], 50);
    assert.match(d, /^M 0,0 C /);
    assert.match(d, /L 10,50 L 0,50 Z$/);
  });
});
