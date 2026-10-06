// @covers tools/app-shell/src/components/financial-accounts/AccountsSidebar/balanceDisplay.js
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatDashboardCompact } from '@/lib/dashboardNumberFormat.js';
import { getDashboardValueTypography } from '@/lib/dashboardValueTypography.js';
import { APPROXIMATE_PREFIX, SIDEBAR_BALANCE_THRESHOLDS, buildBalanceDisplay } from '../balanceDisplay.js';

// The real canonical formatters are used on purpose (as most app-shell tests do). In this
// file the currency-format config is never loaded, so it runs on the defaults: `.`/`,`
// separators and every currency symbol on the right ("2,50K $"). The USD left-side
// rendering of the real app is covered in `balanceDisplay.symbolSide.vitest.js`.
//
// `formatCurrency` separates the amount from the symbol with a NON-breaking space.
const NBSP = ' ';
const LOCALE = 'es-ES';

const SIZE_30 = { fontSize: '30px', lineHeight: '32px' };
const SIZE_24 = { fontSize: '24px', lineHeight: '28px' };
const SIZE_20 = { fontSize: '20px', lineHeight: '24px' };

describe('APPROXIMATE_PREFIX', () => {
  it('is "≈ "', () => {
    expect(APPROXIMATE_PREFIX).toBe('≈ ');
  });
});

describe('SIDEBAR_BALANCE_THRESHOLDS', () => {
  it('is medium from 15 and small from 19 characters, and frozen', () => {
    expect({ ...SIDEBAR_BALANCE_THRESHOLDS }).toEqual({ mediumFrom: 15, smallFrom: 19 });
    expect(Object.isFrozen(SIDEBAR_BALANCE_THRESHOLDS)).toBe(true);
  });
});

describe('buildBalanceDisplay', () => {
  it('returns exactly { text, title, style }', () => {
    const result = buildBalanceDisplay('EUR', 1250.5, { locale: LOCALE });
    expect(Object.keys(result).sort()).toEqual(['style', 'text', 'title']);
  });

  it('does not compact an amount under 1.000 (-357,99 €), text equals title', () => {
    const result = buildBalanceDisplay('EUR', -357.99, { locale: LOCALE });
    expect(result.text).toBe(`-357,99${NBSP}€`);
    expect(result.text).toBe(formatCurrency('EUR', -357.99));
    expect(result.title).toBe(result.text);
    expect(result.style).toEqual(SIZE_30);
  });

  it('always compacts an amount of 1.000 or more, exact value in title', () => {
    const result = buildBalanceDisplay('EUR', 1250.5, { locale: LOCALE });
    expect(result.text).toBe(`1,25K${NBSP}€`);
    expect(result.title).toBe(`1.250,50${NBSP}€`);
  });

  it('compacts a huge value to B notation and keeps the exact value in title', () => {
    const total = 797841242058.53;
    const result = buildBalanceDisplay('EUR', total, { locale: LOCALE });
    expect(result.text).toBe(`797,84B${NBSP}€`);
    expect(result.title).toBe(`797.841.242.058,53${NBSP}€`);
    expect(result.title).toBe(formatCurrency('EUR', total));
    expect(result.text.length).toBeLessThan(result.title.length);
  });

  it('prefixes both text and title with "≈ " when approximate', () => {
    const total = 797841242058.53;
    const result = buildBalanceDisplay('EUR', total, { approximate: true, locale: LOCALE });
    expect(result.text).toBe(`≈ 797,84B${NBSP}€`);
    expect(result.title).toBe(`≈ ${formatCurrency('EUR', total)}`);
  });

  it('defaults to non-approximate when no options are passed', () => {
    const result = buildBalanceDisplay('EUR', 1250.5);
    expect(result.text.startsWith(APPROXIMATE_PREFIX)).toBe(false);
    expect(result.title.startsWith(APPROXIMATE_PREFIX)).toBe(false);
    expect(result.text).toBe(formatDashboardCompact(1250.5, { currencyLabel: 'EUR' }));
  });

  it('adds no prefix when approximate is false', () => {
    const result = buildBalanceDisplay('EUR', 1250.5, { approximate: false, locale: LOCALE });
    expect(result.text).not.toContain('≈');
    expect(result.title).not.toContain('≈');
  });

  it('keeps the sign of a negative compacted amount in both text and title', () => {
    const result = buildBalanceDisplay('EUR', -125500, { locale: LOCALE });
    expect(result.text).toBe(`-125,50K${NBSP}€`);
    expect(result.title).toBe(formatCurrency('EUR', -125500));
  });

  it('formats with the given ISO (USD), not a hardcoded EUR', () => {
    const result = buildBalanceDisplay('USD', 2500, { locale: LOCALE });
    expect(result.text).toBe(formatDashboardCompact(2500, { currencyLabel: 'USD', locale: LOCALE }));
    expect(result.title).toBe(formatCurrency('USD', 2500));
    expect(result.text).toContain('$');
    expect(result.text).toContain('2,50K');
    expect(result.text).not.toContain('€');
    expect(result.title).toContain('2.500,00');
  });

  it('formats a zero total without compacting', () => {
    const result = buildBalanceDisplay('EUR', 0, { locale: LOCALE });
    expect(result.text).toBe(`0,00${NBSP}€`);
    expect(result.title).toBe(result.text);
    expect(result.style).toEqual(SIZE_30);
  });

  describe('style', () => {
    // The sidebar sizes the FULL displayed string (prefix included) with its own cutoffs:
    // 30px below 15 characters, 24px from 15, 20px from 19. See balanceDisplay.js.
    it('is the dashboard helper applied to the displayed text with the sidebar cutoffs', () => {
      for (const [total, approximate] of [
        [4456468760950.01, false],
        [44564687609500, true],
        [875423150000000, true],
        [-1e16, true],
      ]) {
        const result = buildBalanceDisplay('EUR', total, { approximate, locale: LOCALE });
        expect(result.style).toEqual(getDashboardValueTypography(result.text, SIDEBAR_BALANCE_THRESHOLDS));
      }
    });

    it('does not use the dashboard defaults (12 chars would be 20px there, 30px here)', () => {
      const result = buildBalanceDisplay('EUR', 87542310000000, { locale: LOCALE });
      expect(result.text).toBe(`87.542,31B${NBSP}€`);
      expect(result.text).toHaveLength(12);
      expect(getDashboardValueTypography(result.text)).toEqual(SIZE_20);
      expect(result.style).toEqual(SIZE_30);
    });

    it('counts the "≈ " prefix: the same total crosses 14/15 only when approximate', () => {
      // "87.542,31B CHF" is 14 characters; the prefix makes it 16.
      const plain = buildBalanceDisplay('CHF', 87542310000000, { locale: LOCALE });
      const approx = buildBalanceDisplay('CHF', 87542310000000, { approximate: true, locale: LOCALE });
      expect(plain.text).toHaveLength(14);
      expect(approx.text).toHaveLength(16);
      expect(approx.text.startsWith(APPROXIMATE_PREFIX)).toBe(true);
      expect(plain.style).toEqual(SIZE_30);
      expect(approx.style).toEqual(SIZE_24);
    });

    it('keeps 30px for an approximate 9-char compact value (prefix counted: 11 chars)', () => {
      const result = buildBalanceDisplay('EUR', 797841242058.53, { approximate: true, locale: LOCALE });
      expect(result.text).toHaveLength(11);
      expect(result.style).toEqual(SIZE_30);
    });

    it.each([
      ['30px for a short compact value (1,25K €)', 1250.5, false, `1,25K${NBSP}€`, SIZE_30],
      ['30px for a 9-char compact value (797,84B €)', 797841242058.53, false, `797,84B${NBSP}€`, SIZE_30],
      ['30px for an 11-char compact value (4.456,47B €)', 4456468760950.01, false, `4.456,47B${NBSP}€`, SIZE_30],
      ['30px for a 14-char approximate value (≈ 44.564,69B €)', 44564687609500, true, `≈ 44.564,69B${NBSP}€`, SIZE_30],
      ['30px at 14 chars (≈ 87.542,31B €)', 87542310000000, true, `≈ 87.542,31B${NBSP}€`, SIZE_30],
      ['24px at 15 chars (≈ 875.423,15B €)', 875423150000000, true, `≈ 875.423,15B${NBSP}€`, SIZE_24],
      ['24px at 18 chars (≈ 10.000.000,00B €)', 1e16, true, `≈ 10.000.000,00B${NBSP}€`, SIZE_24],
      ['20px at 19 chars (1.000.000.000,00B €)', 1e18, false, `1.000.000.000,00B${NBSP}€`, SIZE_20],
    ])('picks %s', (_label, total, approximate, expectedText, expectedStyle) => {
      const result = buildBalanceDisplay('EUR', total, { approximate, locale: LOCALE });
      expect(result.text).toBe(expectedText);
      expect(result.style).toEqual(expectedStyle);
    });

    it.each([
      ['≈ 87.542,31B €', 87542310000000, true, `≈ 87.542,31B${NBSP}€`, SIZE_30],
      ['-357,99 €', -357.99, false, `-357,99${NBSP}€`, SIZE_30],
      ['≈ -999,99K €', -999990, true, `≈ -999,99K${NBSP}€`, SIZE_30],
      ['10^15 (1.000.000,00B €)', 1e15, false, `1.000.000,00B${NBSP}€`, SIZE_24],
      ['10^15 approximate and negative (≈ -1.000.000,00B €)', -1e15, true, `≈ -1.000.000,00B${NBSP}€`, SIZE_24],
      ['10^18 (1.000.000.000,00B €)', 1e18, false, `1.000.000.000,00B${NBSP}€`, SIZE_20],
      ['10^18 approximate and negative (≈ -1.000.000.000,00B €)', -1e18, true, `≈ -1.000.000.000,00B${NBSP}€`, SIZE_20],
    ])('real total %s gets its documented size and keeps the exact value in title', (_label, total, approximate, expectedText, expectedStyle) => {
      const result = buildBalanceDisplay('EUR', total, { approximate, locale: LOCALE });
      expect(result.text).toBe(expectedText);
      expect(result.style).toEqual(expectedStyle);
      expect(result.title).toBe(`${approximate ? APPROXIMATE_PREFIX : ''}${formatCurrency('EUR', total)}`);
    });

    it('counts a minus that follows the prefix (18 → 19 chars drops to 20px)', () => {
      const positive = buildBalanceDisplay('EUR', 1e16, { approximate: true, locale: LOCALE });
      const negative = buildBalanceDisplay('EUR', -1e16, { approximate: true, locale: LOCALE });
      expect(positive.text).toHaveLength(18);
      expect(negative.text).toBe(`≈ -10.000.000,00B${NBSP}€`);
      expect(negative.text).toHaveLength(19);
      expect(positive.style).toEqual(SIZE_24);
      expect(negative.style).toEqual(SIZE_20);
    });

    it('does not count a leading minus without the prefix (negative keeps the positive size)', () => {
      // "-87.542,31B CHF" is 15 characters but measures 14 → 30px;
      // "-10.000.000,00B CHF" is 19 characters but measures 18 → 24px.
      const at14 = buildBalanceDisplay('CHF', -87542310000000, { locale: LOCALE });
      const at18 = buildBalanceDisplay('CHF', -1e16, { locale: LOCALE });
      expect(at14.text).toHaveLength(15);
      expect(at14.style).toEqual(SIZE_30);
      expect(at14.style).toEqual(buildBalanceDisplay('CHF', 87542310000000, { locale: LOCALE }).style);
      expect(at18.text).toHaveLength(19);
      expect(at18.style).toEqual(SIZE_24);
      expect(at18.style).toEqual(buildBalanceDisplay('CHF', 1e16, { locale: LOCALE }).style);
    });
  });
});
