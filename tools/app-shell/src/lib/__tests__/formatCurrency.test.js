import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency } from '../formatCurrency.js';

describe('formatCurrency', () => {
  describe('USD — symbol before amount', () => {
    it('formats positive amount', () => {
      assert.equal(formatCurrency('USD', 1234.56), '$1,234.56');
    });

    it('formats zero', () => {
      assert.equal(formatCurrency('USD', 0), '$0.00');
    });

    it('formats negative amount', () => {
      assert.equal(formatCurrency('USD', -250.5), '-$250.50');
    });

    it('formats large amount with thousand separators', () => {
      assert.equal(formatCurrency('USD', 1_000_000), '$1,000,000.00');
    });

    it('rounds to two decimal places', () => {
      assert.equal(formatCurrency('USD', 9.999), '$10.00');
    });

    it('preserves two decimal places', () => {
      assert.equal(formatCurrency('USD', 1.1), '$1.10');
    });
  });

  describe('EUR — symbol after amount with space', () => {
    it('formats positive amount', () => {
      assert.equal(formatCurrency('EUR', 1234.56), '1,234.56 €');
    });

    it('formats zero', () => {
      assert.equal(formatCurrency('EUR', 0), '0.00 €');
    });

    it('formats negative amount', () => {
      assert.equal(formatCurrency('EUR', -99.9), '-99.90 €');
    });

    it('formats large amount with thousand separators', () => {
      assert.equal(formatCurrency('EUR', 1_000_000), '1,000,000.00 €');
    });
  });

  describe('symbol-after currencies — SEK, NOK, DKK, CZK, HUF, PLN', () => {
    it('formats SEK with symbol after amount', () => {
      assert.match(formatCurrency('SEK', 1234.56), /1,234\.56\s+kr/);
    });

    it('formats NOK with symbol after amount', () => {
      assert.match(formatCurrency('NOK', 500), /500\.00\s+kr/);
    });
  });

  describe('other currencies — symbol before amount (same as USD)', () => {
    it('formats ARS with symbol before amount', () => {
      const result = formatCurrency('ARS', 500);
      assert.match(result, /500/);
      // Symbol must come before the number
      const symbolIdx = result.search(/[^0-9,.\-\s]/);
      const numberIdx = result.search(/[0-9]/);
      assert.ok(symbolIdx < numberIdx, `Expected symbol before number in: ${result}`);
    });

    it('formats GBP with symbol before amount', () => {
      assert.equal(formatCurrency('GBP', 99.5), '£99.50');
    });
  });

  describe('invalid numeric input', () => {
    it('returns em dash for null', () => {
      assert.equal(formatCurrency('USD', null), '\u2014');
    });

    it('returns em dash for undefined', () => {
      assert.equal(formatCurrency('USD', undefined), '\u2014');
    });

    it('returns em dash for NaN', () => {
      assert.equal(formatCurrency('USD', NaN), '\u2014');
    });

    it('returns em dash for non-numeric string', () => {
      assert.equal(formatCurrency('USD', 'abc'), '\u2014');
    });

    it('returns em dash for Infinity', () => {
      assert.equal(formatCurrency('USD', Infinity), '\u2014');
    });
  });

  describe('invalid or unsupported currency code', () => {
    it('falls back to plain numeric formatting for unknown code', () => {
      const result = formatCurrency('XYZ_INVALID', 100);
      assert.match(result, /100/);
      assert.equal(result, '100.00');
    });

    it('falls back for empty string currency code', () => {
      const result = formatCurrency('', 50);
      assert.match(result, /50/);
    });
  });

  describe('null/undefined currency code — fallback path (callers use ?? "USD")', () => {
    it('null code falls back to plain numeric formatting', () => {
      const result = formatCurrency(null, 1234);
      assert.equal(result, '1,234.00');
    });

    it('undefined code falls back to plain numeric formatting', () => {
      const result = formatCurrency(undefined, 1234);
      assert.equal(result, '1,234.00');
    });

    it('null code with null value returns em dash', () => {
      assert.equal(formatCurrency(null, null), '—');
    });
  });

  describe('numeric string values — coercion', () => {
    it('accepts a numeric string and formats it correctly (USD)', () => {
      assert.equal(formatCurrency('USD', '1234.56'), '$1,234.56');
    });

    it('accepts a numeric string and formats it correctly (EUR)', () => {
      assert.equal(formatCurrency('EUR', '99.9'), '99.90 €');
    });

    it('treats empty string as zero for USD', () => {
      // Number('') === 0, so empty string coerces to 0
      assert.equal(formatCurrency('USD', ''), '$0.00');
    });
  });

  describe('symbol-after currencies — DKK, CZK, HUF, PLN', () => {
    it('formats DKK with symbol after amount', () => {
      assert.match(formatCurrency('DKK', 100), /100\.00\s+kr/);
    });

    it('formats CZK with symbol after amount', () => {
      assert.match(formatCurrency('CZK', 100), /100\.00\s+Kč/);
    });

    it('formats HUF with symbol after amount', () => {
      assert.match(formatCurrency('HUF', 100), /100\.00\s+Ft/);
    });

    it('formats PLN with symbol after amount', () => {
      assert.match(formatCurrency('PLN', 100), /100\.00\s+zł/);
    });

    it('formats negative DKK with leading minus before amount', () => {
      const result = formatCurrency('DKK', -55);
      assert.ok(result.startsWith('-'), `Expected leading minus, got: ${result}`);
      assert.match(result, /55\.00/);
    });
  });

  describe('-0 edge case', () => {
    // -0 < 0 is false in JS, so the EUR symbol-after path treats it as positive zero
    it('EUR: negative zero renders as positive zero (no minus sign)', () => {
      assert.equal(formatCurrency('EUR', -0), '0.00 €');
    });

    // For USD (symbol-before), Intl.NumberFormat renders -0 with a minus sign
    // This is a known inconsistency between the two paths in formatCurrency
    it('USD: negative zero renders with minus sign (Intl.NumberFormat behavior)', () => {
      assert.equal(formatCurrency('USD', -0), '-$0.00');
    });
  });

  describe('compact notation — opt-in third argument', () => {
    it('USD: formats thousands in compact notation with the symbol before', () => {
      assert.equal(formatCurrency('USD', 12500, { compact: true }), '$12.50K');
    });

    it('USD: formats millions in compact notation', () => {
      assert.equal(formatCurrency('USD', 1_500_000, { compact: true }), '$1.50M');
    });

    it('EUR: formats compact notation with the symbol after the amount', () => {
      assert.equal(formatCurrency('EUR', 12500, { compact: true }), '12.50K €');
    });

    it('omitting the option leaves standard (non-compact) output unchanged', () => {
      // Backward-compatible: no third arg → standard notation, as every existing call site relies on.
      assert.equal(formatCurrency('USD', 12500), '$12,500.00');
    });

    it('compact: false is equivalent to omitting the option', () => {
      assert.equal(formatCurrency('USD', 12500, { compact: false }), '$12,500.00');
    });
  });

  describe('large negative amounts', () => {
    it('USD handles large negative with thousand separators', () => {
      assert.equal(formatCurrency('USD', -1_000_000), '-$1,000,000.00');
    });

    it('EUR handles large negative with thousand separators', () => {
      assert.equal(formatCurrency('EUR', -1_000_000), '-1,000,000.00 €');
    });
  });
});
