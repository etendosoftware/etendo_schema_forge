import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatSigned } from '../formatSigned.js';

// Narrow non-breaking spaces emitted by Intl can vary; normalize for assertions.
const norm = (s) => s.replace(/ | /g, ' ');

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
      // Grouping separator is environment-dependent (Node ICU vs browser);
      // assert the sign, decimal comma and symbol, tolerate optional grouping.
      assert.match(norm(formatSigned(1234.5, 'EUR')), /^\+1[.\s]?234,50 €$/);
    });

    it('prefixes "-" for negative amounts (absolute value formatted)', () => {
      assert.equal(norm(formatSigned(-99.9, 'EUR')), '-99,90 €');
    });

    it('treats zero as positive', () => {
      assert.equal(norm(formatSigned(0, 'EUR')), '+0,00 €');
    });

    it('coerces non-numeric amounts to 0 (positive)', () => {
      assert.equal(norm(formatSigned('x', 'EUR')), '+0,00 €');
    });

    it('always uses es-ES decimal style and the given currency', () => {
      const out = norm(formatSigned(1000, 'USD'));
      // es-ES decimal comma + leading sign; currency rendered as US$.
      assert.match(out, /^\+1[.\s]?000,00 US\$$/);
    });
  });
});
