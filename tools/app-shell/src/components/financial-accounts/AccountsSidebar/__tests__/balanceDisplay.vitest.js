import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatDashboardCompact } from '@/lib/dashboardNumberFormat.js';
import { getDashboardValueTypography } from '@/lib/dashboardValueTypography.js';
import { APPROXIMATE_PREFIX, buildBalanceDisplay } from '../balanceDisplay.js';

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
    it('is the dashboard typography of the compact string', () => {
      const total = 4456468760950.01;
      const result = buildBalanceDisplay('EUR', total, { locale: LOCALE });
      const compact = formatDashboardCompact(total, { currencyLabel: 'EUR', locale: LOCALE });
      expect(result.style).toEqual(getDashboardValueTypography(compact));
    });

    it('is not affected by the "≈ " prefix', () => {
      for (const total of [-357.99, 1250.5, 797841242058.53, 4456468760950.01, 44564687609500]) {
        const plain = buildBalanceDisplay('EUR', total, { locale: LOCALE });
        const approx = buildBalanceDisplay('EUR', total, { approximate: true, locale: LOCALE });
        expect(approx.style).toEqual(plain.style);
      }
    });

    it('keeps 30px for a 9-char compact string even when the prefix makes it 11', () => {
      const result = buildBalanceDisplay('EUR', 797841242058.53, { approximate: true, locale: LOCALE });
      expect(result.text).toHaveLength(11);
      expect(result.style).toEqual(SIZE_30);
    });

    it.each([
      ['30px for a short compact value', 1250.5, `1,25K${NBSP}€`, SIZE_30],
      ['30px for a 9-char compact value', 797841242058.53, `797,84B${NBSP}€`, SIZE_30],
      ['24px for an 11-char compact value', 4456468760950.01, `4.456,47B${NBSP}€`, SIZE_24],
      ['20px for a 12-char compact value', 44564687609500, `44.564,69B${NBSP}€`, SIZE_20],
    ])('picks %s', (_label, total, expectedText, expectedStyle) => {
      const result = buildBalanceDisplay('EUR', total, { locale: LOCALE });
      expect(result.text).toBe(expectedText);
      expect(result.style).toEqual(expectedStyle);
    });

    it('ignores the minus sign when sizing (negative keeps the positive size)', () => {
      const negative = buildBalanceDisplay('EUR', -4456468760950.01, { locale: LOCALE });
      const positive = buildBalanceDisplay('EUR', 4456468760950.01, { locale: LOCALE });
      expect(negative.style).toEqual(positive.style);
      expect(negative.style).toEqual(SIZE_24);
    });
  });
});
