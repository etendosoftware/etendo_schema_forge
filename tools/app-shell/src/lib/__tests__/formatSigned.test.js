import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatSigned } from '../formatSigned.js';

// `formatSigned` now delegates entirely to the shared `formatCurrency()`
// (ETP-4314), which under the `es-ES` locale inserts a NON-BREAKING SPACE
// (U+00A0) between the amount and the currency symbol/word — not a regular
// space. All exact-match assertions below use the literal ` ` escape,
// consistent with formatCurrency.test.js.
const NBSP = ' ';

describe('formatSigned helpers', () => {
  describe('formatDate', () => {
    it('returns an em dash for falsy input', () => {
      assert.equal(formatDate(null, 'es-ES'), '—');
      assert.equal(formatDate('', 'es-ES'), '—');
      assert.equal(formatDate(undefined, 'es-ES'), '—');
    });

    it('returns an em dash for an invalid date string', () => {
      assert.equal(formatDate('not-a-date', 'es-ES'), '—');
    });

    it('formats a UTC-midnight date-only payload without timezone drift', () => {
      // 2026-04-27 must stay the 27th regardless of the host timezone.
      assert.equal(formatDate('2026-04-27T00:00:00Z', 'es-ES'), '27/04/2026');
    });

    it('honors the provided BCP locale ordering', () => {
      assert.equal(formatDate('2026-04-27T00:00:00Z', 'en-US'), '04/27/2026');
    });
  });

  describe('formatSigned', () => {
    it('prefixes "+" for positive amounts', () => {
      assert.equal(formatSigned(1234.5, 'EUR'), `+1.234,50${NBSP}€`);
    });

    it('prefixes "-" for negative amounts (absolute value formatted)', () => {
      assert.equal(formatSigned(-99.9, 'EUR'), `-99,90${NBSP}€`);
    });

    it('treats zero as positive', () => {
      assert.equal(formatSigned(0, 'EUR'), `+0,00${NBSP}€`);
    });

    it('coerces non-numeric amounts to 0 (positive)', () => {
      assert.equal(formatSigned('x', 'EUR'), `+0,00${NBSP}€`);
    });

    it('always uses es-ES decimal style and the given currency', () => {
      // narrowSymbol currencyDisplay renders USD as "$", not "US$".
      assert.equal(formatSigned(1000, 'USD'), `+1.000,00${NBSP}$`);
    });

    describe('useGrouping regression (ETP-4314) — thousands separator must survive delegation to formatCurrency', () => {
      // Regression coverage for the exact bug fixed here: formatSigned used to
      // build its own Intl.NumberFormat without `useGrouping: true`, so any
      // amount >= 1000 rendered without a thousands separator
      // (e.g. "+1234,50 €" instead of "+1.234,50 €"). It now delegates to
      // formatCurrency(), which sets useGrouping explicitly.
      it('EUR: 1234.5 includes the thousands separator', () => {
        const result = formatSigned(1234.5, 'EUR');
        assert.equal(result, `+1.234,50${NBSP}€`);
        assert.ok(result.includes('.'), `Expected a thousands separator in: ${result}`);
      });

      it('EUR: a negative amount >= 1000 also groups thousands', () => {
        const result = formatSigned(-2500.75, 'EUR');
        assert.equal(result, `-2.500,75${NBSP}€`);
        assert.ok(result.includes('.'), `Expected a thousands separator in: ${result}`);
      });

      it('EUR: 1,000,000 includes two grouped thousands separators', () => {
        const result = formatSigned(1_000_000, 'EUR');
        assert.equal(result, `+1.000.000,00${NBSP}€`);
        assert.equal((result.match(/\./g) || []).length, 2, `Expected two thousands separators in: ${result}`);
      });

      it('999.99 (just under the boundary) has no thousands separator', () => {
        const result = formatSigned(999.99, 'EUR');
        assert.equal(result, `+999,99${NBSP}€`);
      });
    });
  });
});
