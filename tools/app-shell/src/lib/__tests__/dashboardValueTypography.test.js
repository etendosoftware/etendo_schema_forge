// @covers tools/app-shell/src/lib/dashboardValueTypography.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_VALUE_THRESHOLDS, getDashboardValueTypography } from '../dashboardValueTypography.js';

// Shared headline-amount sizing for the dashboard financial summary and the Financial
// Accounts "Saldo" total (ETP-5580). Length is measured on the displayed string with a
// leading '-' removed. The cutoffs default to the dashboard's (10 / 12); a caller may pass
// its own, and a missing key falls back to its default.
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

describe('DASHBOARD_VALUE_THRESHOLDS', () => {
  it('holds the dashboard cutoffs: medium from 10, small from 12', () => {
    assert.deepEqual({ ...DASHBOARD_VALUE_THRESHOLDS }, { mediumFrom: 10, smallFrom: 12 });
  });

  it('is frozen, so no caller can shift the dashboard sizes for everyone', () => {
    assert.ok(Object.isFrozen(DASHBOARD_VALUE_THRESHOLDS));
  });
});

describe('getDashboardValueTypography — thresholds argument', () => {
  describe('no thresholds keeps the dashboard defaults', () => {
    it('is the same as passing DASHBOARD_VALUE_THRESHOLDS explicitly', () => {
      for (const length of [0, 1, 9, 10, 11, 12, 13, 30]) {
        const value = 'x'.repeat(length);
        assert.deepEqual(
          getDashboardValueTypography(value),
          getDashboardValueTypography(value, DASHBOARD_VALUE_THRESHOLDS),
          `length ${length}`,
        );
      }
    });

    it('an empty object behaves as no thresholds (9 → 30px, 10 → 24px, 12 → 20px)', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(9), {}), SIZE_30);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(10), {}), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(12), {}), SIZE_20);
    });

    it('null thresholds fall back to the defaults instead of throwing', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(9), null), SIZE_30);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(11), null), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(12), null), SIZE_20);
    });

    it('undefined thresholds fall back to the defaults', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(9), undefined), SIZE_30);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(10), undefined), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(12), undefined), SIZE_20);
    });
  });

  describe('custom cutoffs (the sidebar shape: 15 / 19)', () => {
    const WIDE = { mediumFrom: 15, smallFrom: 19 };

    it('14 chars → 30px, 15 → 24px', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(14), WIDE), SIZE_30);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(15), WIDE), SIZE_24);
    });

    it('18 chars → 24px, 19 → 20px', () => {
      assert.deepEqual(getDashboardValueTypography('x'.repeat(18), WIDE), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(19), WIDE), SIZE_20);
    });

    it('a value the dashboard would drop to 20px stays at 30px under wider cutoffs', () => {
      const value = 'x'.repeat(12);
      assert.deepEqual(getDashboardValueTypography(value), SIZE_20);
      assert.deepEqual(getDashboardValueTypography(value, WIDE), SIZE_30);
    });

    it('still ignores a leading minus: "-" + 14 chars → 30px, "-" + 18 → 24px', () => {
      assert.deepEqual(getDashboardValueTypography(`-${'x'.repeat(14)}`, WIDE), SIZE_30);
      assert.deepEqual(getDashboardValueTypography(`-${'x'.repeat(18)}`, WIDE), SIZE_24);
    });

    it('counts a minus that is not the first character', () => {
      // "≈ -" + 12: the minus is the third character, so 15 characters are measured.
      assert.deepEqual(getDashboardValueTypography(`≈ -${'x'.repeat(12)}`, WIDE), SIZE_24);
    });
  });

  describe('partial thresholds fall back per key', () => {
    it('only mediumFrom given: smallFrom stays 12', () => {
      const t = { mediumFrom: 5 };
      assert.deepEqual(getDashboardValueTypography('x'.repeat(4), t), SIZE_30);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(5), t), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(11), t), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(12), t), SIZE_20);
    });

    it('only smallFrom given: mediumFrom stays 10', () => {
      const t = { smallFrom: 20 };
      assert.deepEqual(getDashboardValueTypography('x'.repeat(9), t), SIZE_30);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(10), t), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(19), t), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(20), t), SIZE_20);
    });

    it('an explicitly undefined key falls back to its default', () => {
      const t = { mediumFrom: undefined, smallFrom: 19 };
      assert.deepEqual(getDashboardValueTypography('x'.repeat(10), t), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(18), t), SIZE_24);
      assert.deepEqual(getDashboardValueTypography('x'.repeat(19), t), SIZE_20);
    });
  });
});
