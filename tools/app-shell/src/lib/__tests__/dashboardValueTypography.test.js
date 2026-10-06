// @covers tools/app-shell/src/lib/dashboardValueTypography.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDashboardValueTypography } from '../dashboardValueTypography.js';

// Headline-amount sizing of the dashboard financial summary (`FinancialSummaryCard`). The
// cutoffs are pinned at 10 / 12 characters. Length is measured on the displayed string with a
// leading '-' removed. (The Financial Accounts "Saldo" total does not use it: it is fixed at
// 30px and ellipsises, see `AccountsSidebar/balanceDisplay.js`.)
const SIZE_30 = { fontSize: '30px', lineHeight: '32px' };
const SIZE_24 = { fontSize: '24px', lineHeight: '28px' };
const SIZE_20 = { fontSize: '20px', lineHeight: '24px' };

describe('getDashboardValueTypography', () => {
  describe('boundaries', () => {
    it('9 chars → 30px / 32px', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(9)), SIZE_30);
    });

    it('10 chars → 24px / 28px', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(10)), SIZE_24);
    });

    it('11 chars → 24px / 28px', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(11)), SIZE_24);
    });

    it('12 chars → 20px / 24px', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(12)), SIZE_20);
    });

    it('far beyond 12 chars stays at 20px / 24px', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(40)), SIZE_20);
    });
  });

  describe('leading minus sign', () => {
    it('is not counted: "-" + 9 chars stays at 30px', () => {
      assert.deepEqual(getDashboardValueTypography(`-${'x'.repeat(9)}`), SIZE_30);
    });

    it('is not counted: "-" + 11 chars stays at 24px', () => {
      assert.deepEqual(getDashboardValueTypography(`-${'x'.repeat(11)}`), SIZE_24);
    });

    it('only the leading one is stripped (an inner "-" counts)', () => {
      assert.deepEqual(getDashboardValueTypography('12345-7890'), SIZE_24);
    });

    it('a lone "-" is a zero-length value → 30px', () => {
      assert.deepEqual(getDashboardValueTypography('-'), SIZE_30);
    });
  });

  describe('input types', () => {
    it('null → 30px', () => {
      assert.deepEqual(getDashboardValueTypography(null), SIZE_30);
    });

    it('undefined → 30px', () => {
      assert.deepEqual(getDashboardValueTypography(undefined), SIZE_30);
    });

    it('empty string → 30px', () => {
      assert.deepEqual(getDashboardValueTypography(''), SIZE_30);
    });

    it('a number is measured by its string form', () => {
      assert.deepEqual(getDashboardValueTypography(123456789), SIZE_30);
      assert.deepEqual(getDashboardValueTypography(1234567890), SIZE_24);
      assert.deepEqual(getDashboardValueTypography(-123456789012), SIZE_20);
    });

    it('the loading placeholder "—" → 30px', () => {
      assert.deepEqual(getDashboardValueTypography('—'), SIZE_30);
    });
  });

  it('returns a fresh object each call (callers may not share/mutate one style)', () => {
    const a = getDashboardValueTypography('abc');
    const b = getDashboardValueTypography('abc');
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
  });
});
