import { describe, it, expect } from 'vitest';
import { computeBalance } from '../balanceTotals.js';

const cfg = { debitField: 'amtSourceDr', creditField: 'amtSourceCr' };

describe('computeBalance', () => {
  it('treats empty lines as balanced (savable draft) with no amounts', () => {
    expect(computeBalance([], null, null, cfg)).toEqual({
      totalDebit: 0, totalCredit: 0, difference: 0, isBalanced: true, hasAmounts: false,
    });
  });

  it('balances when debit equals credit and total > 0', () => {
    const lines = [
      { amtSourceDr: '100', amtSourceCr: '0' },
      { amtSourceDr: '0', amtSourceCr: '100' },
    ];
    expect(computeBalance(lines, null, null, cfg)).toEqual({
      totalDebit: 100, totalCredit: 100, difference: 0, isBalanced: true, hasAmounts: true,
    });
  });

  it('is not balanced when totals differ', () => {
    const lines = [
      { amtSourceDr: '100', amtSourceCr: '0' },
      { amtSourceDr: '0', amtSourceCr: '60' },
    ];
    const r = computeBalance(lines, null, null, cfg);
    expect(r.difference).toBe(40);
    expect(r.isBalanced).toBe(false);
  });

  it('treats an all-zero line as balanced (savable) with no amounts', () => {
    const lines = [{ amtSourceDr: '0', amtSourceCr: '0' }];
    const r = computeBalance(lines, null, null, cfg);
    expect(r.isBalanced).toBe(true);
    expect(r.hasAmounts).toBe(false);
  });

  it('flags an imbalance as not balanced and reports hasAmounts', () => {
    const lines = [{ amtSourceDr: '100', amtSourceCr: '0' }];
    const r = computeBalance(lines, null, null, cfg);
    expect(r.isBalanced).toBe(false);
    expect(r.hasAmounts).toBe(true);
  });

  it('includes the pending (in-progress add) line', () => {
    const lines = [{ amtSourceDr: '100', amtSourceCr: '0' }];
    const pending = { amtSourceDr: '0', amtSourceCr: '100' };
    expect(computeBalance(lines, pending, null, cfg).isBalanced).toBe(true);
  });

  it('applies the editing-line snapshot over the saved line', () => {
    const lines = [
      { id: 'a', amtSourceDr: '100', amtSourceCr: '0' },
      { id: 'b', amtSourceDr: '0', amtSourceCr: '40' },
    ];
    const editing = { id: 'b', amtSourceCr: '100' };
    expect(computeBalance(lines, null, editing, cfg).isBalanced).toBe(true);
  });

  it('rounds to 2 decimals to avoid float drift', () => {
    const lines = [
      { amtSourceDr: '0.1', amtSourceCr: '0' },
      { amtSourceDr: '0.2', amtSourceCr: '0' },
      { amtSourceDr: '0', amtSourceCr: '0.3' },
    ];
    expect(computeBalance(lines, null, null, cfg).isBalanced).toBe(true);
  });

  it('rounds negative half-cent boundaries symmetrically (sign-aware)', () => {
    // A debit and credit that are equal in magnitude must net to exactly 0.
    // With a naive `n + EPSILON`, the negative side rounds toward +∞ and leaves
    // a 1-cent residual, breaking the balance. -1.005 and 1.005 must cancel.
    const lines = [
      { amtSourceDr: '0', amtSourceCr: '1.005' },
      { amtSourceDr: '0', amtSourceCr: '-1.005' },
    ];
    const r = computeBalance(lines, null, null, cfg);
    expect(r.totalCredit).toBe(0);
    expect(r.difference).toBe(0);
    expect(r.isBalanced).toBe(true);
  });

  it('keeps a negative difference balanced against an equal negative debit', () => {
    const lines = [
      { amtSourceDr: '-1.005', amtSourceCr: '0' },
      { amtSourceDr: '0', amtSourceCr: '-1.005' },
    ];
    expect(computeBalance(lines, null, null, cfg).isBalanced).toBe(true);
  });

  it('returns not-balanced when config is missing', () => {
    expect(computeBalance([{ amtSourceDr: '1' }], null, null, null).isBalanced).toBe(false);
  });
});
