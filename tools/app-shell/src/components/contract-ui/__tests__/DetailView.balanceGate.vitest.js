import { describe, it, expect } from 'vitest';
import { computeBalanceGate } from '../DetailView.jsx';

/**
 * Behavioral guard for the balance completion gate (ETP-4244, PR #716 review).
 *
 * blockCompleteForBalance must mean: "not balanced, OR a 0=0 entry with no
 * amounts". It must NOT couple completability to the SIGN of the debit total —
 * a balanced entry carrying real (even negative) amounts is completable.
 */
const balanceFooter = { debitField: 'amtSourceDr', creditField: 'amtSourceCr' };

const gate = (children) =>
  computeBalanceGate({ balanceFooter, children, pendingLineValues: null, lineEdits: null, selectedLine: null });

describe('computeBalanceGate — blockCompleteForBalance', () => {
  it('allows completion for a balanced entry with positive amounts', () => {
    const r = gate([{ amtSourceDr: '100', amtSourceCr: '0' }, { amtSourceDr: '0', amtSourceCr: '100' }]);
    expect(r.blockCompleteForBalance).toBe(false);
  });

  it('blocks completion for a 0=0 draft (balanced but no amounts)', () => {
    const r = gate([{ amtSourceDr: '0', amtSourceCr: '0' }]);
    expect(r.blockCompleteForBalance).toBe(true);
  });

  it('blocks completion for an unbalanced entry', () => {
    const r = gate([{ amtSourceDr: '100', amtSourceCr: '0' }]);
    expect(r.blockCompleteForBalance).toBe(true);
  });

  it('allows completion for a balanced entry with negative amounts', () => {
    const r = gate([{ amtSourceDr: '-100', amtSourceCr: '0' }, { amtSourceDr: '0', amtSourceCr: '-100' }]);
    expect(r.blockCompleteForBalance).toBe(false);
  });

  it('does not block save for a 0=0 draft (savable draft)', () => {
    const r = gate([{ amtSourceDr: '0', amtSourceCr: '0' }]);
    expect(r.blockSaveForBalance).toBe(false);
  });
});
