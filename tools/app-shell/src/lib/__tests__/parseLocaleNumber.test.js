// ETP-5107 — canonical locale-aware number parser (the inverse of formatCurrency()).
// See docs/plans/2026-09-08-etp5107-price-input-locale-fix.md §6.1 for the full
// design and the JSDoc on parseLocaleNumber.js for the exact input/output contract.
//
// Mirrors formatCurrency.test.js's own technique for exercising the shared,
// module-level `getCurrencyFormatConfig()` cache: stub `globalThis.fetch` and run
// the REAL `fetchCurrencyFormatConfig()` (never a mocked module), so this test
// proves parsing genuinely reads the same config formatCurrency() reads — not a
// hardcoded separator baked into parseLocaleNumber.js itself.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocaleNumber } from '../parseLocaleNumber.js';
import { fetchCurrencyFormatConfig } from '../currencyFormatConfig.js';

describe('parseLocaleNumber — default config (comma decimal, before any fetch resolves)', () => {
  describe('happy path — comma decimal (the configured separator)', () => {
    it('parses a simple comma-decimal value', () => {
      assert.deepEqual(parseLocaleNumber('10,4'), { value: 10.4, isValid: true });
    });

    it('parses an integer with no separator at all', () => {
      assert.deepEqual(parseLocaleNumber('10'), { value: 10, isValid: true });
    });

    it('parses zero', () => {
      assert.deepEqual(parseLocaleNumber('0'), { value: 0, isValid: true });
    });

    it('parses a comma-decimal with multiple fractional digits', () => {
      assert.deepEqual(parseLocaleNumber('1234,5678'), { value: 1234.5678, isValid: true });
    });
  });

  describe('happy path — period is always accepted too (keyboards/numpads emit it regardless of locale)', () => {
    it('parses a period-decimal value even though the configured separator is comma', () => {
      assert.deepEqual(parseLocaleNumber('10.4'), { value: 10.4, isValid: true });
    });

    it('parses a plain integer string with a period-decimal fraction', () => {
      assert.deepEqual(parseLocaleNumber('99.99'), { value: 99.99, isValid: true });
    });
  });

  describe('negative numbers', () => {
    it('parses a negative integer', () => {
      assert.deepEqual(parseLocaleNumber('-5'), { value: -5, isValid: true });
    });

    it('parses a negative comma-decimal', () => {
      assert.deepEqual(parseLocaleNumber('-12,50'), { value: -12.5, isValid: true });
    });

    it('parses a negative period-decimal', () => {
      assert.deepEqual(parseLocaleNumber('-12.50'), { value: -12.5, isValid: true });
    });
  });

  describe('empty / partial-typing states — "still typing", not invalid (isValid stays true, value is null)', () => {
    it('empty string', () => {
      assert.deepEqual(parseLocaleNumber(''), { value: null, isValid: true });
    });

    it('a lone minus sign', () => {
      assert.deepEqual(parseLocaleNumber('-'), { value: null, isValid: true });
    });

    it('a trailing decimal separator with digits before it is already parseable', () => {
      // Per the JSDoc's own example: '1,' -> { value: 1, isValid: true }.
      assert.deepEqual(parseLocaleNumber('1,'), { value: 1, isValid: true });
    });

    it('a trailing period with digits before it is already parseable', () => {
      assert.deepEqual(parseLocaleNumber('1.'), { value: 1, isValid: true });
    });

    it('a lone decimal separator with no digits at all is still-typing, not invalid', () => {
      assert.deepEqual(parseLocaleNumber(','), { value: null, isValid: true });
    });

    it('a minus followed by a lone decimal separator ("-,") is still-typing, not invalid', () => {
      assert.deepEqual(parseLocaleNumber('-,'), { value: null, isValid: true });
    });

    it('whitespace-only input trims to empty and is treated as still-typing', () => {
      assert.deepEqual(parseLocaleNumber('   '), { value: null, isValid: true });
    });
  });

  describe('invalid states — text that could never become valid by typing more characters', () => {
    it('a trailing letter makes the whole string invalid', () => {
      assert.deepEqual(parseLocaleNumber('12a'), { value: null, isValid: false });
    });

    it('two decimal separators (both commas) is invalid', () => {
      assert.deepEqual(parseLocaleNumber('1,2,3'), { value: null, isValid: false });
    });

    it('a comma AND a period both present (two separator occurrences total) is invalid', () => {
      // parseLocaleNumber does NOT understand thousands-grouping — a string with
      // both characters present has two separator occurrences, which the pattern
      // rejects outright (see parseLocaleNumber.js's own docstring on this).
      assert.deepEqual(parseLocaleNumber('1.234,56'), { value: null, isValid: false });
    });

    it('a misplaced minus sign (not at the start) is invalid', () => {
      assert.deepEqual(parseLocaleNumber('1-2'), { value: null, isValid: false });
    });

    it('a minus sign after digits is invalid', () => {
      assert.deepEqual(parseLocaleNumber('12-'), { value: null, isValid: false });
    });

    it('a purely alphabetic string is invalid', () => {
      assert.deepEqual(parseLocaleNumber('abc'), { value: null, isValid: false });
    });

    it('a stray plus sign is invalid (never an accepted character)', () => {
      assert.deepEqual(parseLocaleNumber('+5'), { value: null, isValid: false });
    });
  });

  describe('number passthrough — already a real JS Number, no string parsing needed', () => {
    it('passes a finite number straight through', () => {
      assert.deepEqual(parseLocaleNumber(10.5), { value: 10.5, isValid: true });
    });

    it('passes zero straight through', () => {
      assert.deepEqual(parseLocaleNumber(0), { value: 0, isValid: true });
    });

    it('passes a negative number straight through', () => {
      assert.deepEqual(parseLocaleNumber(-3.5), { value: -3.5, isValid: true });
    });

    it('NaN is invalid', () => {
      assert.deepEqual(parseLocaleNumber(NaN), { value: null, isValid: false });
    });

    it('Infinity is invalid', () => {
      assert.deepEqual(parseLocaleNumber(Infinity), { value: null, isValid: false });
    });

    it('-Infinity is invalid', () => {
      assert.deepEqual(parseLocaleNumber(-Infinity), { value: null, isValid: false });
    });
  });

  describe('null / undefined', () => {
    it('null is still-typing (value null, valid)', () => {
      assert.deepEqual(parseLocaleNumber(null), { value: null, isValid: true });
    });

    it('undefined is still-typing (value null, valid)', () => {
      assert.deepEqual(parseLocaleNumber(undefined), { value: null, isValid: true });
    });

    it('called with no argument at all behaves like undefined', () => {
      assert.deepEqual(parseLocaleNumber(), { value: null, isValid: true });
    });
  });
});

// Separator-driven, not hardcoded: stub the config to a PERIOD-decimal locale via
// the real fetchCurrencyFormatConfig() (same technique formatCurrency.test.js
// uses for its own 'symbol position' describe block) and re-verify parsing flips
// with it — proving parseLocaleNumber reads getCurrencyFormatConfig() live rather
// than a value baked in at import time.
describe('parseLocaleNumber — period-decimal locale config (proves parsing is separator-driven)', () => {
  before(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        thousandsSeparator: ',',
        decimalSeparator: '.',
      }),
    });
    try {
      await fetchCurrencyFormatConfig();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('parses a period-decimal value as the configured separator', () => {
    assert.deepEqual(parseLocaleNumber('10.4'), { value: 10.4, isValid: true });
  });

  it('a comma is now INVALID — only the configured separator (period) and the always-accepted period are recognized, and they are the same character here', () => {
    // With decimalSeparator === '.', parseLocaleNumber's own accepted-character
    // set collapses to just ['.'] (see its source comment) — a comma is not a
    // thousands separator to this function, it is simply an unrecognized char.
    assert.deepEqual(parseLocaleNumber('10,4'), { value: null, isValid: false });
  });

  it('still accepts a plain integer with no separator', () => {
    assert.deepEqual(parseLocaleNumber('1500'), { value: 1500, isValid: true });
  });

  it('still-typing states behave the same regardless of which separator is configured', () => {
    assert.deepEqual(parseLocaleNumber(''), { value: null, isValid: true });
    assert.deepEqual(parseLocaleNumber('-'), { value: null, isValid: true });
    assert.deepEqual(parseLocaleNumber('1.'), { value: 1, isValid: true });
  });

  it('negative period-decimal parses correctly under this config', () => {
    assert.deepEqual(parseLocaleNumber('-99.9'), { value: -99.9, isValid: true });
  });
});
