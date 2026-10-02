import { fetchCurrencyFormatConfig } from '@/lib/currencyFormatConfig.js';
import { buildBalanceDisplay } from '../balanceDisplay.js';

// The real app loads the currency-format config (`GET /sws/neo/currency-format`) once at
// start-up; its `symbolRightSide` map comes from `C_CURRENCY.ISSYMBOLRIGHTSIDE`, where EUR
// is the only currency flagged right-side. Without that load (the default in the other
// tests) every symbol renders on the right, e.g. "2,50K $". This file loads a realistic
// snapshot through the real fetcher, so it checks what the user actually sees. It is a
// separate file so the loaded module-level cache cannot leak into the default-config tests.
const NBSP = ' ';

beforeAll(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      thousandsSeparator: '.',
      decimalSeparator: ',',
      symbolRightSide: { EUR: true, USD: false, GBP: false, ARS: false },
    }),
  }));
  try {
    await fetchCurrencyFormatConfig();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

describe('buildBalanceDisplay with the real symbol-side config', () => {
  it('puts the USD symbol on the left in both the compact text and the exact title', () => {
    const result = buildBalanceDisplay('USD', 2500, { locale: 'es-ES' });
    expect(result.text).toBe('$2,50K');
    expect(result.title).toBe('$2.500,00');
  });

  it('keeps the approximate prefix in front of a left-side symbol', () => {
    const result = buildBalanceDisplay('USD', 2500, { approximate: true, locale: 'es-ES' });
    expect(result.text).toBe('≈ $2,50K');
    expect(result.title).toBe('≈ $2.500,00');
  });

  it('keeps EUR on the right, with the scale suffix before the symbol', () => {
    const result = buildBalanceDisplay('EUR', 797841242058.53, { locale: 'es-ES' });
    expect(result.text).toBe(`797,84B${NBSP}€`);
    expect(result.title).toBe(`797.841.242.058,53${NBSP}€`);
  });
});
