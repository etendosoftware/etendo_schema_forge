// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxMoney.js
// New file justification: invoiceInboxMoney.js is a new unit with no test; it imports the `@/` alias,
// so it needs Vitest (the Node-runner model test cannot load it).
const cfg = vi.hoisted(() => ({ value: { thousandsSeparator: '.', decimalSeparator: ',' }, left: {} }));
vi.mock('@/lib/currencyFormatConfig.js', () => ({
  getCurrencyFormatConfig: () => cfg.value,
  isCurrencySymbolRightSide: (code) => cfg.left[code] !== false,
}));

import { formatMoney } from '../invoiceInboxMoney.js';
import { formatCurrency } from '@/lib/formatCurrency.js';

const norm = (s) => s.replace(/\s+/g, ' ');

describe('formatMoney', () => {
  it('shows exactly `scale` decimals: 2 by default, 0 for a JPY-like currency, 3 for a 3-decimal one', () => {
    expect(norm(formatMoney('EUR', 1234.5))).toBe(norm(formatCurrency('EUR', 1234.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
    const yen = norm(formatMoney('JPY', 1234.4, 0));
    expect(yen).toBe(norm(formatCurrency('JPY', 1234.4, { minimumFractionDigits: 0, maximumFractionDigits: 0 })));
    expect(yen).not.toMatch(/[.,]\d{1,2}(?!\d)\D*$/);
    const dinar = norm(formatMoney('KWD', 1.5, 3));
    expect(dinar).toMatch(/1[.,]500/);
  });

  it('pads missing decimals and rounds extra ones to the scale', () => {
    expect(formatMoney('EUR', 5, 2)).toMatch(/5[.,]00/);
    expect(formatMoney('EUR', 5.126, 2)).toMatch(/5[.,]13/);
    expect(formatMoney('JPY', 5.5, 0)).toMatch(/6/);
  });

  it('keeps the sign and groups big numbers', () => {
    const negative = norm(formatMoney('EUR', -1234567.891, 2));
    expect(negative).toMatch(/-/);
    expect(negative).toMatch(/1[.,\s ]234[.,\s ]567[.,]89/);
    expect(norm(formatMoney('EUR', 0, 2))).toMatch(/0[.,]00/);
  });

  it('maxDigits above the scale shows up to that many decimals, never fewer than the scale', () => {
    expect(formatMoney('EUR', 0.123456, 2, { maxDigits: 6 })).toMatch(/0[.,]123456/);
    expect(formatMoney('EUR', 12.5, 2, { maxDigits: 6 })).toMatch(/12[.,]50(?!\d)/);
    expect(formatMoney('JPY', 0.5, 0, { maxDigits: 6 })).toMatch(/0[.,]5(?!\d)/);
  });

  it('a maxDigits below the scale never drops decimals the scale requires', () => {
    expect(formatMoney('EUR', 3.14159, 2, { maxDigits: 0 })).toMatch(/3[.,]14/);
  });

  it('matches formatCurrency output for the same digits (the canonical formatter is the only one used)', () => {
    for (const [code, value, scale] of [['USD', 1000.126, 2], ['EUR', -0.005, 2], ['JPY', 98765, 0], ['EUR', 1.23456, 6]]) {
      expect(formatMoney(code, value, scale)).toBe(formatCurrency(code, value, { minimumFractionDigits: scale, maximumFractionDigits: scale }));
    }
  });
});

describe('formatMoney with the instance separators (es-style and en-style config)', () => {
  afterEach(() => { cfg.value = { thousandsSeparator: '.', decimalSeparator: ',' }; cfg.left = {}; });

  it('es-style config: 1.234,50 with the symbol after', () => {
    expect(norm(formatMoney('EUR', 1234.5, 2))).toBe('1.234,50 €');
  });

  it('en-style config: 1,234.50 and a left-side symbol for a currency configured that way', () => {
    cfg.value = { thousandsSeparator: ',', decimalSeparator: '.' };
    cfg.left = { USD: false };
    expect(norm(formatMoney('USD', 1234.5, 2))).toBe('$1,234.50');
    expect(norm(formatMoney('USD', -1234.5, 2))).toMatch(/-.*1,234\.50|1,234\.50.*-/);
  });

  it('a 0-decimal currency under en-style config shows grouped integers and no decimal separator', () => {
    cfg.value = { thousandsSeparator: ',', decimalSeparator: '.' };
    const text = norm(formatMoney('JPY', 1234567.4, 0));
    expect(text).toContain('1,234,567');
    expect(text).not.toContain('.');
  });
});
