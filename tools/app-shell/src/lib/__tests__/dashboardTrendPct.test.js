import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTrendPct, trendDirection } from '../dashboardTrendPct.js';

describe('formatTrendPct (ETP-5493)', () => {
  it('rounds a large value to an integer with no decimals', () => {
    assert.equal(formatTrendPct(4113.8), '4114');
  });

  it('shows the absolute value of a negative trend', () => {
    assert.equal(formatTrendPct(-12.5), '13');
    assert.equal(formatTrendPct(-50), '50');
  });

  it('collapses a tiny negative value to 0 without a minus sign', () => {
    assert.equal(formatTrendPct(-0.4), '0');
  });

  it('rounds down below the half point', () => {
    assert.equal(formatTrendPct(12.4), '12');
  });

  it('returns 0 for null, undefined and NaN', () => {
    assert.equal(formatTrendPct(null), '0');
    assert.equal(formatTrendPct(undefined), '0');
    assert.equal(formatTrendPct(Number.NaN), '0');
  });

  it('accepts numeric strings and rounds them', () => {
    assert.equal(formatTrendPct('12.6'), '13');
    assert.equal(formatTrendPct('-3.2'), '3');
  });

  it('returns 0 for a non-numeric string', () => {
    assert.equal(formatTrendPct('abc'), '0');
  });
});

describe('trendDirection (ETP-5493)', () => {
  it('is flat when the rounded value is 0, whatever the sign', () => {
    assert.equal(trendDirection(0.4), 'flat');
    assert.equal(trendDirection(-0.4), 'flat');
    assert.equal(trendDirection(0), 'flat');
  });

  it('is up from 0.5 upwards', () => {
    assert.equal(trendDirection(0.5), 'up');
    assert.equal(trendDirection(4113.8), 'up');
  });

  it('is down from -0.6 downwards', () => {
    assert.equal(trendDirection(-0.6), 'down');
    assert.equal(trendDirection(-12.5), 'down');
  });

  it('rounds half away from zero like formatTrendPct, so -0.5 is down (not the -0 of Math.round)', () => {
    // formatTrendPct prints "1" for -0.5 (magnitude rounded half up), so the direction must agree:
    // a naive Math.round(-0.5) would give -0 and wrongly report flat.
    assert.equal(formatTrendPct(-0.5), '1');
    assert.equal(trendDirection(-0.5), 'down');
  });

  it('is down for -1.5 and -2.5 and up for 0.5 (half away from zero)', () => {
    assert.equal(trendDirection(-1.5), 'down');
    assert.equal(trendDirection(-2.5), 'down');
    assert.equal(trendDirection(0.5), 'up');
  });

  it('is flat for null, undefined, NaN and non-numeric input', () => {
    for (const v of [null, undefined, Number.NaN, 'abc']) {
      assert.equal(trendDirection(v), 'flat');
    }
  });

  it('accepts numeric strings', () => {
    assert.equal(trendDirection('-0.6'), 'down');
    assert.equal(trendDirection('0.4'), 'flat');
  });

  it('agrees with the printed number: a "0" is never up or down', () => {
    for (const v of [-0.49, -0.4, 0, 0.4, 0.49]) {
      assert.equal(formatTrendPct(v), '0');
      assert.equal(trendDirection(v), 'flat');
    }
  });

  it('converse: a non-zero printed pct is never flat, and the sign of the value decides up/down', () => {
    for (const v of [-0.5, -0.51, -1.5, -12.5, 0.5, 0.51, 1.5, 12.5]) {
      assert.notEqual(formatTrendPct(v), '0', `${v} must print a non-zero pct`);
      assert.equal(trendDirection(v), v < 0 ? 'down' : 'up', `direction of ${v}`);
    }
  });
});
