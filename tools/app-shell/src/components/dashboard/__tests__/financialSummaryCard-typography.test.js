import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// getMetricValueTypography: inline pure function from FinancialSummaryCard.jsx.
// Adjusts font-size based on formatted value length to prevent overflow at high zoom levels.
// Three tiers: default 30px, medium ≥10 chars → 24px, long ≥12 chars → 20px.
//
// Example values below use the ETP-4314 output shape (es-ES separators, currency
// symbol after the amount, e.g. "1.234,56 €") rather than the old literal ISO
// code prefix ("EUR 1,234.56") — that literal-code format no longer exists.
function getMetricValueTypography(value) {
  const length = String(value ?? '').replace(/^-/, '').length;
  if (length >= 12) return { fontSize: '20px', lineHeight: '24px' };
  if (length >= 10) return { fontSize: '24px', lineHeight: '28px' };
  return { fontSize: '30px', lineHeight: '32px' };
}

describe('FinancialSummaryCard — getMetricValueTypography overflow tiers', () => {
  describe('default tier (< 10 chars → 30px)', () => {
    it('short compact value returns 30px / 32px', () => {
      const t = getMetricValueTypography('1,50 €K');
      assert.equal(t.fontSize, '30px');
      assert.equal(t.lineHeight, '32px');
    });

    it('single-digit number returns 30px', () => {
      assert.equal(getMetricValueTypography('5').fontSize, '30px');
    });

    it('dash placeholder "—" (1 char) returns 30px', () => {
      assert.equal(getMetricValueTypography('—').fontSize, '30px');
    });

    it('9-char value stays in default tier', () => {
      assert.equal(getMetricValueTypography('125,50 €K').fontSize, '30px');
    });
  });

  describe('medium tier (10–11 chars → 24px)', () => {
    it('10-char value returns 24px / 28px', () => {
      const t = getMetricValueTypography('7.284,20 €');
      assert.equal(t.fontSize, '24px');
      assert.equal(t.lineHeight, '28px');
    });

    it('11-char value stays at 24px', () => {
      const t = getMetricValueTypography('1.234,50 €K');
      assert.equal(t.fontSize, '24px');
      assert.equal(t.lineHeight, '28px');
    });
  });

  describe('compact tier (≥ 12 chars → 20px)', () => {
    it('12-char value returns 20px / 24px', () => {
      const t = getMetricValueTypography('123.456,00 €');
      assert.equal(t.fontSize, '20px');
      assert.equal(t.lineHeight, '24px');
    });

    it('very long value stays at 20px', () => {
      assert.equal(getMetricValueTypography('12.345.678,00 €').fontSize, '20px');
    });
  });

  describe('sign handling', () => {
    it('strips leading minus before counting length', () => {
      // "-125,50 €" without the minus is 8 chars → default 30px tier
      assert.equal(getMetricValueTypography('-125,50 €').fontSize, '30px');
    });

    it('negative 10-char value (minus stripped) → 24px', () => {
      // "-1.234,56 €" without minus is 10 chars → 24px
      assert.equal(getMetricValueTypography('-1.234,56 €').fontSize, '24px');
    });
  });

  describe('edge cases', () => {
    it('null falls back to empty string (0 chars) → 30px', () => {
      assert.equal(getMetricValueTypography(null).fontSize, '30px');
    });

    it('undefined falls back to empty string (0 chars) → 30px', () => {
      assert.equal(getMetricValueTypography(undefined).fontSize, '30px');
    });

    it('empty string (0 chars) → 30px', () => {
      assert.equal(getMetricValueTypography('').fontSize, '30px');
    });
  });
});
