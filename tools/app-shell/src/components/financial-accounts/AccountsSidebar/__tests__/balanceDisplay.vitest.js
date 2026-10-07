// @covers tools/app-shell/src/components/financial-accounts/AccountsSidebar/balanceDisplay.js
import { formatCurrency } from '@/lib/formatCurrency.js';
import { APPROXIMATE_PREFIX, BALANCE_TYPOGRAPHY, buildBalanceDisplay } from '../balanceDisplay.js';

// The sidebar "Saldo" total is the FULL amount (canonical `formatCurrency`, no K/M/B), with
// "≈ " in front when a currency was converted, at a fixed 30px / 32px that never shrinks.
//
// The real canonical formatter is used on purpose (as most app-shell tests do). In this file
// the currency-format config is never loaded, so it runs on the defaults: `.`/`,` separators
// and every currency symbol on the right ("2.500,00 $"). The USD left-side rendering of the
// real app is covered in `balanceDisplay.symbolSide.vitest.js`.
//
// `formatCurrency` separates the amount from the symbol with a NON-breaking space.
const NBSP = ' ';

const SIZE_30 = { fontSize: '30px', lineHeight: '32px' };

describe('APPROXIMATE_PREFIX', () => {
  it('is "≈ "', () => {
    expect(APPROXIMATE_PREFIX).toBe('≈ ');
  });
});

describe('BALANCE_TYPOGRAPHY', () => {
  it('is the fixed 30px / 32px of the sidebar total, and frozen', () => {
    expect({ ...BALANCE_TYPOGRAPHY }).toEqual(SIZE_30);
    expect(Object.isFrozen(BALANCE_TYPOGRAPHY)).toBe(true);
  });
});

describe('buildBalanceDisplay', () => {
  it('returns exactly { text, style } (no title: the tooltip shows `text`)', () => {
    const result = buildBalanceDisplay('EUR', 1250.5);
    expect(Object.keys(result).sort()).toEqual(['style', 'text']);
  });

  it('shows the full amount, never compacted', () => {
    const result = buildBalanceDisplay('EUR', 1250.5);
    expect(result.text).toBe(`1.250,50${NBSP}€`);
    expect(result.text).toBe(formatCurrency('EUR', 1250.5));
    expect(result.text).not.toMatch(/[KMB]/);
  });

  it('shows a huge amount in full (no B notation)', () => {
    const total = 797841242058.53;
    const result = buildBalanceDisplay('EUR', total);
    expect(result.text).toBe(`797.841.242.058,53${NBSP}€`);
    expect(result.text).toBe(formatCurrency('EUR', total));
  });

  it('keeps the sign of a negative amount', () => {
    const result = buildBalanceDisplay('EUR', -357.99);
    expect(result.text).toBe(`-357,99${NBSP}€`);
  });

  it('keeps the sign of a large negative amount in full', () => {
    const result = buildBalanceDisplay('EUR', -125500);
    expect(result.text).toBe(`-125.500,00${NBSP}€`);
    expect(result.text).toBe(formatCurrency('EUR', -125500));
  });

  it('formats a zero total', () => {
    expect(buildBalanceDisplay('EUR', 0).text).toBe(`0,00${NBSP}€`);
  });

  it('prefixes the full amount with "≈ " when approximate', () => {
    const total = 797841242058.53;
    const result = buildBalanceDisplay('EUR', total, { approximate: true });
    expect(result.text).toBe(`≈ 797.841.242.058,53${NBSP}€`);
    expect(result.text).toBe(`${APPROXIMATE_PREFIX}${formatCurrency('EUR', total)}`);
  });

  it('puts "≈ " before the minus of a negative approximate amount', () => {
    const result = buildBalanceDisplay('EUR', -999990, { approximate: true });
    expect(result.text).toBe(`≈ -999.990,00${NBSP}€`);
  });

  it('defaults to non-approximate when no options are passed', () => {
    const result = buildBalanceDisplay('EUR', 1250.5);
    expect(result.text.startsWith(APPROXIMATE_PREFIX)).toBe(false);
  });

  it('adds no prefix when approximate is false', () => {
    const result = buildBalanceDisplay('EUR', 1250.5, { approximate: false });
    expect(result.text).not.toContain('≈');
  });

  it('formats with the given ISO (USD), not a hardcoded EUR', () => {
    const result = buildBalanceDisplay('USD', 2500);
    expect(result.text).toBe(formatCurrency('USD', 2500));
    expect(result.text).toContain('2.500,00');
    expect(result.text).toContain('$');
    expect(result.text).not.toContain('€');
  });

  describe('style', () => {
    it('is the fixed 30px / 32px whatever the length, sign or prefix', () => {
      for (const total of [0, -357.99, 1250.5, 99999999.99, -1e15, 1e18]) {
        for (const approximate of [false, true]) {
          const result = buildBalanceDisplay('EUR', total, { approximate });
          expect(result.style).toEqual(SIZE_30);
        }
      }
    });

    it('does not shrink a long amount (the sidebar ellipsises instead)', () => {
      const result = buildBalanceDisplay('EUR', -1e18, { approximate: true });
      expect(result.text).toBe(`≈ -1.000.000.000.000.000.000,00${NBSP}€`);
      expect(result.style).toEqual(SIZE_30);
    });

    it('is the shared BALANCE_TYPOGRAPHY constant', () => {
      expect(buildBalanceDisplay('EUR', 1).style).toBe(BALANCE_TYPOGRAPHY);
    });
  });
});
