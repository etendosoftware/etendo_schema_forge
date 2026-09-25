import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  calendarDateSortValue,
  candidateBaseAmount,
  candidateBasePendingBalance,
  LINE_SORT_ACCESSORS,
  buildCandidateSortAccessors,
} from '../reconciliationSort.js';
import { sortRows } from '@/lib/clientSort.js';

/**
 * ETP-5242 — the sort accessors of the reconciliation split panel.
 *
 * Both panels sort in memory through `useClientSort` → `sortRows`; this module only decides what
 * value each column is ordered BY. The tests therefore go through the real `sortRows` comparator
 * wherever the question is "which row comes first", so blank-last handling and numeric compare
 * are exercised exactly as the panel runs them.
 */

const ids = (rows) => rows.map((r) => r.id);
const sortBy = (rows, key, accessors, direction = 'asc') =>
  sortRows(rows, { key, direction, accessors, locale: 'es-ES' });

// ── calendarDateSortValue ───────────────────────────────────────────────────────

// TZ is forced per describe block — `process.env.TZ` takes effect per call in Node, the same
// technique the *.tz-bug.vitest.jsx files use. Buenos Aires (UTC-3, no DST) is where a
// `new Date('yyyy-MM-dd')` reads back as the PREVIOUS day.
describe.each([
  'America/Argentina/Buenos_Aires',
  'Europe/Madrid',
  'UTC',
])('calendarDateSortValue under TZ=%s', (tz) => {
  const originalTz = process.env.TZ;
  beforeAll(() => { process.env.TZ = tz; });
  afterAll(() => { process.env.TZ = originalTz; });

  it('keeps a row dated the 1st on the 1st (local midnight, not UTC midnight)', () => {
    const value = calendarDateSortValue('2026-06-01');
    const d = new Date(value);

    expect(value).toBe(new Date(2026, 5, 1).getTime());
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(5);
  });

  it('reads a UTC-midnight timestamp by its calendar-day prefix', () => {
    // The backend serialises date-only columns as `yyyy-MM-ddT00:00:00Z`; the prefix is the day.
    expect(calendarDateSortValue('2026-06-01T00:00:00Z')).toBe(new Date(2026, 5, 1).getTime());
  });

  it('orders rows by calendar day, with the 1st between the 31st and the 2nd', () => {
    const rows = [
      { id: 'jun2', date: '2026-06-02' },
      { id: 'jun1', date: '2026-06-01T00:00:00Z' },
      { id: 'may31', date: '2026-05-31' },
    ];

    expect(ids(sortBy(rows, 'date', LINE_SORT_ACCESSORS))).toEqual(['may31', 'jun1', 'jun2']);
    expect(ids(sortBy(rows, 'date', LINE_SORT_ACCESSORS, 'desc'))).toEqual(['jun2', 'jun1', 'may31']);
  });

  it('treats a date-only and a UTC-midnight timestamp of the same day as equal (stable order)', () => {
    const rows = [
      { id: 'a', date: '2026-06-01T00:00:00Z' },
      { id: 'b', date: '2026-06-01' },
    ];

    expect(ids(sortBy(rows, 'date', LINE_SORT_ACCESSORS))).toEqual(['a', 'b']);
  });
});

describe('calendarDateSortValue — missing values', () => {
  it('returns null for missing or unparseable dates', () => {
    expect(calendarDateSortValue(null)).toBeNull();
    expect(calendarDateSortValue(undefined)).toBeNull();
    expect(calendarDateSortValue('')).toBeNull();
    expect(calendarDateSortValue('not a date')).toBeNull();
  });

  it('sorts rows with no date last, in both directions', () => {
    const rows = [
      { id: 'none', date: null },
      { id: 'late', date: '2026-06-10' },
      { id: 'early', date: '2026-06-01' },
      { id: 'blank', date: '' },
    ];

    expect(ids(sortBy(rows, 'date', LINE_SORT_ACCESSORS))).toEqual(['early', 'late', 'none', 'blank']);
    expect(ids(sortBy(rows, 'date', LINE_SORT_ACCESSORS, 'desc'))).toEqual(['late', 'early', 'none', 'blank']);
  });
});

// ── LINE_SORT_ACCESSORS (left panel) ────────────────────────────────────────────

describe('LINE_SORT_ACCESSORS', () => {
  it('exposes exactly the left panel sort keys', () => {
    expect(Object.keys(LINE_SORT_ACCESSORS).sort()).toEqual(['amount', 'date', 'description', 'progress']);
  });

  describe('amount', () => {
    it('orders numerically, negatives first on ascending', () => {
      const rows = [
        { id: 'p100', amount: 100 },
        { id: 'n50', amount: -50 },
        { id: 'p9', amount: 9 },
        { id: 'n1000', amount: '-1000' },
      ];

      expect(ids(sortBy(rows, 'amount', LINE_SORT_ACCESSORS))).toEqual(['n1000', 'n50', 'p9', 'p100']);
      expect(ids(sortBy(rows, 'amount', LINE_SORT_ACCESSORS, 'desc'))).toEqual(['p100', 'p9', 'n50', 'n1000']);
    });

    it('compares numeric strings as numbers, not text', () => {
      expect(LINE_SORT_ACCESSORS.amount({ amount: '9.5' })).toBe(9.5);
    });

    it('returns null for a missing or non-numeric amount, so it sorts last', () => {
      expect(LINE_SORT_ACCESSORS.amount({ amount: null })).toBeNull();
      expect(LINE_SORT_ACCESSORS.amount({ amount: '' })).toBeNull();
      expect(LINE_SORT_ACCESSORS.amount({ amount: 'abc' })).toBeNull();
      expect(LINE_SORT_ACCESSORS.amount({})).toBeNull();

      const rows = [{ id: 'none' }, { id: 'neg', amount: -5 }];
      expect(ids(sortBy(rows, 'amount', LINE_SORT_ACCESSORS, 'desc'))).toEqual(['neg', 'none']);
    });

    it('keeps a zero amount as zero, not as missing', () => {
      expect(LINE_SORT_ACCESSORS.amount({ amount: 0 })).toBe(0);
    });
  });

  describe('progress', () => {
    it('orders by reconciledPct', () => {
      const rows = [
        { id: 'p75', reconciledPct: 75 },
        { id: 'p10', reconciledPct: '10' },
        { id: 'p50', reconciledPct: 50 },
      ];

      expect(ids(sortBy(rows, 'progress', LINE_SORT_ACCESSORS))).toEqual(['p10', 'p50', 'p75']);
    });

    it('treats a missing reconciledPct as 0 (an empty progress bar), not as blank', () => {
      expect(LINE_SORT_ACCESSORS.progress({})).toBe(0);
      expect(LINE_SORT_ACCESSORS.progress({ reconciledPct: null })).toBe(0);
      expect(LINE_SORT_ACCESSORS.progress({ reconciledPct: 'x' })).toBe(0);

      const rows = [{ id: 'p20', reconciledPct: 20 }, { id: 'none' }];
      // 0 sorts before 20 ascending — it is not pushed to the end like a blank would be.
      expect(ids(sortBy(rows, 'progress', LINE_SORT_ACCESSORS))).toEqual(['none', 'p20']);
    });
  });

  describe('description', () => {
    it('uses description, then partnerName, then referenceNo, then empty', () => {
      const read = LINE_SORT_ACCESSORS.description;
      expect(read({ description: 'D', partnerName: 'P', referenceNo: 'R' })).toBe('D');
      expect(read({ description: '', partnerName: 'P', referenceNo: 'R' })).toBe('P');
      expect(read({ partnerName: null, referenceNo: 'R' })).toBe('R');
      expect(read({})).toBe('');
      expect(read(null)).toBe('');
    });

    it('orders by the text the cell shows, blanks last', () => {
      const rows = [
        { id: 'zeta', description: 'Zeta transfer' },
        { id: 'blank' },
        { id: 'acme', partnerName: 'Acme' },
        { id: 'ref', referenceNo: 'M-REF' },
      ];

      expect(ids(sortBy(rows, 'description', LINE_SORT_ACCESSORS))).toEqual(['acme', 'ref', 'zeta', 'blank']);
    });
  });
});

// ── candidateBaseAmount ─────────────────────────────────────────────────────────

describe('candidateBaseAmount', () => {
  it('returns the plain amount for a same-currency candidate', () => {
    expect(candidateBaseAmount({ amount: 40, currency: 'EUR' }, 'EUR')).toBe(40);
  });

  it('treats a candidate with no currency as account currency', () => {
    expect(candidateBaseAmount({ amount: '12.5' }, 'EUR')).toBe(12.5);
  });

  it('coerces a missing same-currency amount to 0 (the running total never goes NaN)', () => {
    expect(candidateBaseAmount({ currency: 'EUR' }, 'EUR')).toBe(0);
    expect(candidateBaseAmount(null, 'EUR')).toBe(0);
  });

  it('returns amountBase for a foreign-currency candidate, not its raw amount', () => {
    expect(candidateBaseAmount({ amount: 110, amountBase: 100, currency: 'USD' }, 'EUR')).toBe(100);
    expect(candidateBaseAmount({ amount: 110, amountBase: '0', currency: 'USD' }, 'EUR')).toBe(0);
  });

  it('returns null for a foreign-currency candidate whose rate is unknown', () => {
    expect(candidateBaseAmount({ amount: 110, currency: 'USD' }, 'EUR')).toBeNull();
    expect(candidateBaseAmount({ amount: 110, amountBase: null, currency: 'USD' }, 'EUR')).toBeNull();
  });
});

// ── candidateBasePendingBalance ─────────────────────────────────────────────────

describe('candidateBasePendingBalance', () => {
  it('returns the pending balance as-is for a same-currency candidate', () => {
    expect(candidateBasePendingBalance({ amount: 100, pendingBalance: 40, currency: 'EUR' }, 'EUR')).toBe(40);
    expect(candidateBasePendingBalance({ pendingBalance: '-7.5' }, 'EUR')).toBe(-7.5);
  });

  it('returns null when there is no pending balance at all', () => {
    expect(candidateBasePendingBalance({ amount: 100, currency: 'EUR' }, 'EUR')).toBeNull();
    expect(candidateBasePendingBalance({ amount: 100, amountBase: 90, currency: 'USD' }, 'EUR')).toBeNull();
  });

  it('scales a foreign pending balance by the amountBase / amount rate', () => {
    // 200 USD worth 100 EUR, 50 USD still pending → 25 EUR pending.
    expect(candidateBasePendingBalance(
      { amount: 200, amountBase: 100, pendingBalance: 50, currency: 'USD' }, 'EUR',
    )).toBe(25);
  });

  it('reduces to amountBase when the whole amount is still pending', () => {
    expect(candidateBasePendingBalance(
      { amount: 110, amountBase: 100, pendingBalance: 110, currency: 'USD' }, 'EUR',
    )).toBe(100);
  });

  it('falls back to amountBase when the foreign amount is zero or missing (no division by zero)', () => {
    expect(candidateBasePendingBalance(
      { amount: 0, amountBase: 80, pendingBalance: 30, currency: 'USD' }, 'EUR',
    )).toBe(80);
    expect(candidateBasePendingBalance(
      { amountBase: 80, pendingBalance: 30, currency: 'USD' }, 'EUR',
    )).toBe(80);
  });

  it('returns null for a foreign candidate whose rate is unknown', () => {
    expect(candidateBasePendingBalance(
      { amount: 200, pendingBalance: 50, currency: 'USD' }, 'EUR',
    )).toBeNull();
  });
});

// ── buildCandidateSortAccessors (right panel) ───────────────────────────────────

describe('buildCandidateSortAccessors', () => {
  const accessors = buildCandidateSortAccessors('EUR');

  it('exposes exactly the right panel sort keys', () => {
    expect(Object.keys(accessors).sort()).toEqual(['amount', 'date', 'info', 'pendingBalance']);
  });

  it('orders candidates by calendar date, missing dates last', () => {
    const rows = [
      { id: 'none' },
      { id: 'jun', date: '2026-06-01T00:00:00Z' },
      { id: 'may', date: '2026-05-15' },
    ];

    expect(ids(sortBy(rows, 'date', accessors))).toEqual(['may', 'jun', 'none']);
  });

  it('info uses documentNo, then description, then empty', () => {
    expect(accessors.info({ documentNo: 'INV-1', description: 'X' })).toBe('INV-1');
    expect(accessors.info({ documentNo: '', description: 'Fee' })).toBe('Fee');
    expect(accessors.info({})).toBe('');
    expect(accessors.info(null)).toBe('');
  });

  it('orders info with numeric awareness (INV-2 before INV-10)', () => {
    const rows = [
      { id: 'i10', documentNo: 'INV-10' },
      { id: 'i2', documentNo: 'INV-2' },
      { id: 'desc', description: 'Bank fee' },
    ];

    expect(ids(sortBy(rows, 'info', accessors))).toEqual(['desc', 'i2', 'i10']);
  });

  it('orders amounts numerically with negatives', () => {
    const rows = [
      { id: 'p30', amount: 30, currency: 'EUR' },
      { id: 'n20', amount: -20, currency: 'EUR' },
      { id: 'p5', amount: 5, currency: 'EUR' },
    ];

    expect(ids(sortBy(rows, 'amount', accessors))).toEqual(['n20', 'p5', 'p30']);
  });

  it('orders a foreign candidate by its account-currency amountBase, not its raw amount', () => {
    // Raw 1000 JPY is worth 6 EUR — it must sort BELOW a 50 EUR row, not above it.
    const rows = [
      { id: 'jpy', amount: 1000, amountBase: 6, currency: 'JPY' },
      { id: 'eur50', amount: 50, currency: 'EUR' },
      { id: 'eur10', amount: 10, currency: 'EUR' },
    ];

    expect(ids(sortBy(rows, 'amount', accessors))).toEqual(['jpy', 'eur10', 'eur50']);
    expect(ids(sortBy(rows, 'amount', accessors, 'desc'))).toEqual(['eur50', 'eur10', 'jpy']);
  });

  it('sorts a foreign candidate with an unknown rate last, in both directions', () => {
    const rows = [
      { id: 'usd-unknown', amount: 9999, currency: 'USD' },
      { id: 'eur10', amount: 10, currency: 'EUR' },
      { id: 'eur-5', amount: -5, currency: 'EUR' },
    ];

    expect(ids(sortBy(rows, 'amount', accessors))).toEqual(['eur-5', 'eur10', 'usd-unknown']);
    expect(ids(sortBy(rows, 'amount', accessors, 'desc'))).toEqual(['eur10', 'eur-5', 'usd-unknown']);
  });

  it('orders pending balances on the scaled account-currency figure', () => {
    const rows = [
      // 100 USD pending of 200 USD worth 180 EUR → 90 EUR.
      { id: 'usd', amount: 200, amountBase: 180, pendingBalance: 100, currency: 'USD' },
      { id: 'eur95', amount: 95, pendingBalance: 95, currency: 'EUR' },
      { id: 'eur60', amount: 100, pendingBalance: 60, currency: 'EUR' },
      { id: 'unknown', amount: 10, pendingBalance: 1, currency: 'GBP' },
    ];

    expect(ids(sortBy(rows, 'pendingBalance', accessors))).toEqual(['eur60', 'usd', 'eur95', 'unknown']);
  });

  it('is bound to the account currency it was built with', () => {
    const usdAccessors = buildCandidateSortAccessors('USD');
    const cand = { amount: 110, amountBase: 100, currency: 'USD' };

    // Same row: native for a USD account, foreign for an EUR one.
    expect(usdAccessors.amount(cand)).toBe(110);
    expect(accessors.amount(cand)).toBe(100);
  });
});
