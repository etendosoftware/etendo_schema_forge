import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, getCurrencySymbol } from '../formatCurrency.js';

// NOTE (ETP-4314): under the `es-ES` locale, `Intl.NumberFormat` inserts a
// NON-BREAKING SPACE (U+00A0) between the amount and the currency symbol/word
// (and between the compact-notation word and the symbol), not a regular
// space (U+0020). All exact-match assertions below use the literal ` `
// escape rather than a plain space character to make this explicit and avoid
// an invisible-character mismatch.
const NBSP = ' ';

describe('formatCurrency', () => {
  describe('EUR — symbol after amount, Spanish separators (comma decimal, period thousands)', () => {
    it('formats positive amount', () => {
      assert.equal(formatCurrency('EUR', 1234.56), `1.234,56${NBSP}€`);
    });

    it('formats zero', () => {
      assert.equal(formatCurrency('EUR', 0), `0,00${NBSP}€`);
    });

    it('formats negative amount', () => {
      assert.equal(formatCurrency('EUR', -99.9), `-99,90${NBSP}€`);
    });

    it('formats large amount with thousand separators', () => {
      assert.equal(formatCurrency('EUR', 1_000_000), `1.000.000,00${NBSP}€`);
    });
  });

  describe('USD — symbol after amount too (no more symbol-before distinction)', () => {
    it('formats positive amount', () => {
      assert.equal(formatCurrency('USD', 1234.56), `1.234,56${NBSP}$`);
    });

    it('formats zero', () => {
      assert.equal(formatCurrency('USD', 0), `0,00${NBSP}$`);
    });

    it('formats negative amount', () => {
      assert.equal(formatCurrency('USD', -250.5), `-250,50${NBSP}$`);
    });

    it('formats large amount with thousand separators', () => {
      assert.equal(formatCurrency('USD', 1_000_000), `1.000.000,00${NBSP}$`);
    });

    it('rounds to two decimal places', () => {
      assert.equal(formatCurrency('USD', 9.999), `10,00${NBSP}$`);
    });

    it('preserves two decimal places', () => {
      assert.equal(formatCurrency('USD', 1.1), `1,10${NBSP}$`);
    });
  });

  describe('other currencies — same symbol-after convention, no special-casing left (ARS, GBP, DKK)', () => {
    it('formats ARS with symbol after amount', () => {
      assert.equal(formatCurrency('ARS', 500), `500,00${NBSP}$`);
    });

    it('formats GBP with symbol after amount', () => {
      assert.equal(formatCurrency('GBP', 99.5), `99,50${NBSP}£`);
    });

    it('formats DKK with symbol after amount', () => {
      assert.equal(formatCurrency('DKK', 100), `100,00${NBSP}kr`);
    });

    it('formats negative DKK with leading minus before the amount', () => {
      assert.equal(formatCurrency('DKK', -55), `-55,00${NBSP}kr`);
    });
  });

  describe('invalid numeric input', () => {
    it('returns em dash for null', () => {
      assert.equal(formatCurrency('USD', null), '—');
    });

    it('returns em dash for undefined', () => {
      assert.equal(formatCurrency('USD', undefined), '—');
    });

    it('returns em dash for NaN', () => {
      assert.equal(formatCurrency('USD', NaN), '—');
    });

    it('returns em dash for non-numeric string', () => {
      assert.equal(formatCurrency('USD', 'abc'), '—');
    });

    it('returns em dash for Infinity', () => {
      assert.equal(formatCurrency('USD', Infinity), '—');
    });
  });

  describe('invalid or unsupported currency code', () => {
    it('shows a 3-letter unrecognized code as literal text (does not throw)', () => {
      // A well-formed but unrecognized 3-letter ISO code doesn't make Intl throw —
      // it just renders the code itself where the symbol would go.
      assert.equal(formatCurrency('XYZ', 99), `99,00${NBSP}XYZ`);
    });

    it('falls back to plain numeric formatting for a malformed code', () => {
      // 4+ letter codes are not valid ISO 4217 and make `Intl.NumberFormat` throw,
      // hitting the catch-fallback (plain number, no currency shown).
      const result = formatCurrency('XYZ_INVALID', 100);
      assert.equal(result, '100,00');
    });

    it('falls back for empty string currency code', () => {
      // '' is also invalid and throws (RangeError: Invalid currency code).
      const result = formatCurrency('', 50);
      assert.equal(result, '50,00');
    });
  });

  describe('null/undefined currency code — fallback path (callers use ?? "USD")', () => {
    it('null code falls back to plain numeric formatting', () => {
      const result = formatCurrency(null, 1234);
      assert.equal(result, '1.234,00');
    });

    it('undefined code falls back to plain numeric formatting', () => {
      const result = formatCurrency(undefined, 1234);
      assert.equal(result, '1.234,00');
    });

    it('null code with null value returns em dash', () => {
      assert.equal(formatCurrency(null, null), '—');
    });
  });

  describe('numeric string values — coercion', () => {
    it('accepts a numeric string and formats it correctly (USD)', () => {
      assert.equal(formatCurrency('USD', '1234.56'), `1.234,56${NBSP}$`);
    });

    it('accepts a numeric string and formats it correctly (EUR)', () => {
      assert.equal(formatCurrency('EUR', '99.9'), `99,90${NBSP}€`);
    });

    it('treats empty string as zero for USD', () => {
      // Number('') === 0, so empty string coerces to 0
      assert.equal(formatCurrency('USD', ''), `0,00${NBSP}$`);
    });
  });

  describe('-0 edge case', () => {
    // Both currencies now go through the same single code path (no more
    // symbol-before/symbol-after branching), so -0 renders consistently
    // with a leading minus sign for every currency — unlike the old
    // implementation, which had a documented inconsistency between the
    // EUR and USD branches.
    it('EUR: negative zero renders with a minus sign', () => {
      assert.equal(formatCurrency('EUR', -0), `-0,00${NBSP}€`);
    });

    it('USD: negative zero renders with a minus sign', () => {
      assert.equal(formatCurrency('USD', -0), `-0,00${NBSP}$`);
    });
  });

  describe('compact notation — opt-in third argument (Spanish wording under es-ES)', () => {
    it('USD: formats thousands in compact notation using Spanish wording ("mil")', () => {
      assert.equal(formatCurrency('USD', 12500, { compact: true }), `12,50${NBSP}mil${NBSP}$`);
    });

    it('USD: formats millions in compact notation using Spanish wording ("M")', () => {
      // Unlike "mil" (thousands), es-ES's CLDR compact-currency pattern for the "M"
      // (millions) tier's separator between the suffix and the symbol is itself
      // ICU-data-version-dependent (confirmed empirically: Node 23 emits "M$" with
      // none, Node 24 emits "M $" with one) — this compact path is deliberately
      // still Intl-driven (out of scope for ETP-4314's separator centralization,
      // single caller), so tolerate either rather than pinning to one Node's ICU.
      assert.match(formatCurrency('USD', 1_500_000, { compact: true }), new RegExp(`^1,50${NBSP}M${NBSP}?\\$$`));
    });

    it('EUR: formats compact notation with the symbol after the amount', () => {
      assert.equal(formatCurrency('EUR', 12500, { compact: true }), `12,50${NBSP}mil${NBSP}€`);
    });

    it('omitting the option leaves standard (non-compact) output unchanged', () => {
      // Backward-compatible: no third arg → standard notation, as every existing call site relies on.
      assert.equal(formatCurrency('USD', 12500), `12.500,00${NBSP}$`);
    });

    it('compact: false is equivalent to omitting the option', () => {
      assert.equal(formatCurrency('USD', 12500, { compact: false }), `12.500,00${NBSP}$`);
    });
  });

  describe('large negative amounts', () => {
    it('USD handles large negative with thousand separators', () => {
      assert.equal(formatCurrency('USD', -1_000_000), `-1.000.000,00${NBSP}$`);
    });

    it('EUR handles large negative with thousand separators', () => {
      assert.equal(formatCurrency('EUR', -1_000_000), `-1.000.000,00${NBSP}€`);
    });
  });

  describe('useGrouping regression (ETP-4314) — thousands separator must be present for amounts >= 1000', () => {
    // Explicit regression coverage for the bug this ticket fixed: Intl.NumberFormat
    // silently drops the thousands separator for `style: 'currency'` unless
    // `useGrouping: true` is passed explicitly. Every assertion here fails loudly
    // (wrong string) if that option is ever removed from formatCurrency.js —
    // this is the failure mode most likely to slip through manual QA because it
    // looks correct for amounts under 1000.
    it('EUR: 1234.5 includes the thousands separator', () => {
      const result = formatCurrency('EUR', 1234.5);
      assert.equal(result, `1.234,50${NBSP}€`);
      assert.ok(result.includes('.'), `Expected a thousands separator in: ${result}`);
    });

    it('USD: 1234.5 includes the thousands separator', () => {
      const result = formatCurrency('USD', 1234.5);
      assert.equal(result, `1.234,50${NBSP}$`);
      assert.ok(result.includes('.'), `Expected a thousands separator in: ${result}`);
    });

    it('EUR: exactly 1000 includes the thousands separator', () => {
      const result = formatCurrency('EUR', 1000);
      assert.equal(result, `1.000,00${NBSP}€`);
      assert.ok(result.includes('.'), `Expected a thousands separator in: ${result}`);
    });

    it('999.99 (just under the boundary) has no thousands separator', () => {
      // Sanity check for the boundary itself — nothing to group below 1000.
      const result = formatCurrency('EUR', 999.99);
      assert.equal(result, `999,99${NBSP}€`);
    });

    it('EUR: 1,000,000 includes two grouped thousands separators', () => {
      const result = formatCurrency('EUR', 1_000_000);
      assert.equal(result, `1.000.000,00${NBSP}€`);
      assert.equal((result.match(/\./g) || []).length, 2, `Expected two thousands separators in: ${result}`);
    });

    it('USD: a large 7-digit amount includes all expected thousands separators', () => {
      const result = formatCurrency('USD', 1_234_567.89);
      assert.equal(result, `1.234.567,89${NBSP}$`);
      assert.equal((result.match(/\./g) || []).length, 2, `Expected two thousands separators in: ${result}`);
    });

    it('ARS: a large amount includes the thousands separator (non-EUR/USD coverage)', () => {
      const result = formatCurrency('ARS', 1_234_567.89);
      assert.equal(result, `1.234.567,89${NBSP}$`);
      assert.ok(result.includes('.'), `Expected a thousands separator in: ${result}`);
    });

    it('the fallback (invalid-currency) plain-number path also groups thousands', () => {
      // Covers the catch-fallback branch's own `useGrouping: true`.
      const result = formatCurrency('XYZ_INVALID', 1234.5);
      assert.equal(result, '1.234,50');
      assert.ok(result.includes('.'), `Expected a thousands separator in: ${result}`);
    });
  });
});

describe('getCurrencySymbol (ETP-4314)', () => {
  // Regression coverage for the bug this ticket fixed: AmountInput used to
  // hardcode a literal '€' suffix regardless of the actual account/document
  // currency. getCurrencySymbol() resolves the REAL narrow symbol via Intl,
  // with no hardcoded currency→symbol map, so callers can show the correct
  // symbol for any ISO 4217 code.
  it('resolves EUR to €', () => {
    assert.equal(getCurrencySymbol('EUR'), '€');
  });

  it('resolves USD to $', () => {
    assert.equal(getCurrencySymbol('USD'), '$');
  });

  it('resolves GBP to £', () => {
    assert.equal(getCurrencySymbol('GBP'), '£');
  });

  it('resolves ARS to $ (same narrow symbol as USD under es-ES)', () => {
    assert.equal(getCurrencySymbol('ARS'), '$');
  });

  it('resolves DKK to kr (no distinct narrow symbol)', () => {
    assert.equal(getCurrencySymbol('DKK'), 'kr');
  });

  it('returns an empty string for undefined (no currency given)', () => {
    assert.equal(getCurrencySymbol(undefined), '');
  });

  it('returns an empty string for null', () => {
    assert.equal(getCurrencySymbol(null), '');
  });

  it('returns an empty string for an empty string code', () => {
    assert.equal(getCurrencySymbol(''), '');
  });

  it('falls back to the literal code for a well-formed but unrecognized 3-letter code', () => {
    // Matches formatCurrency's own documented behavior: a well-formed but
    // unrecognized code doesn't make Intl throw — it renders the code itself.
    assert.equal(getCurrencySymbol('XYZ'), 'XYZ');
  });

  it('falls back to the literal code (via the catch branch) for a malformed code', () => {
    // 4+ letter codes are not valid ISO 4217 and make `Intl.NumberFormat` throw,
    // hitting the try/catch fallback, which returns the raw code as-is.
    assert.equal(getCurrencySymbol('XYZ_INVALID'), 'XYZ_INVALID');
  });
});
