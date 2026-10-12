// @covers tools/app-shell/src/components/financial-accounts/AccountsSidebar/balanceDisplay.js
import { fetchCurrencyFormatConfig } from '@/lib/currencyFormatConfig.js';
import { buildBalanceDisplay } from '../balanceDisplay.js';

// The real app loads the currency-format config (`GET /sws/neo/currency-format`) once at
// start-up; its `symbolRightSide` map comes from `C_CURRENCY.ISSYMBOLRIGHTSIDE`, where EUR
// is the only currency flagged right-side. Without that load (the default in the other
// tests) every symbol renders on the right, e.g. "2.500,00 $". This file loads a realistic
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
  it('puts the USD symbol on the left of the full amount', () => {
    const result = buildBalanceDisplay('USD', 2500);
    expect(result.text).toBe('$2.500,00');
  });

  it('keeps the approximate prefix in front of a left-side symbol', () => {
    const result = buildBalanceDisplay('USD', 2500, { approximate: true });
    expect(result.text).toBe('≈ $2.500,00');
  });

  it('puts the minus before a left-side symbol, after the approximate prefix', () => {
    const result = buildBalanceDisplay('USD', -14028905.17, { approximate: true });
    expect(result.text).toBe('≈ -$14.028.905,17');
  });

  it('keeps EUR on the right of the full amount', () => {
    const result = buildBalanceDisplay('EUR', 797841242058.53);
    expect(result.text).toBe(`797.841.242.058,53${NBSP}€`);
  });
});
