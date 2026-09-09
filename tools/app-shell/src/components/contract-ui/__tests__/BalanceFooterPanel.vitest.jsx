import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BalanceFooterPanel from '../BalanceFooterPanel.jsx';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => ({
    totalDebit: 'Total debit', totalCredit: 'Total credit',
    difference: 'Difference', balanced: 'Balanced', unbalanced: 'Unbalanced',
  }[k] ?? k),
}));

const cfg = { debitField: 'amtSourceDr', creditField: 'amtSourceCr' };
const fmt = (v) => `€${Number(v).toFixed(2)}`;

describe('BalanceFooterPanel', () => {
  it('renders only the total debit and total credit rows when balanced', () => {
    const lines = [{ amtSourceDr: '100', amtSourceCr: '0' }, { amtSourceDr: '0', amtSourceCr: '100' }];
    render(<BalanceFooterPanel lines={lines} config={cfg} formatAmount={fmt} />);
    expect(screen.getByTestId('balance-total-debit')).toHaveTextContent('€100.00');
    expect(screen.getByTestId('balance-total-credit')).toHaveTextContent('€100.00');
    expect(screen.queryByTestId('balance-difference')).toBeNull();
    expect(screen.queryByTestId('balance-status')).toBeNull();
  });

  it('renders only the total debit and total credit rows when unbalanced (no difference/badge shown)', () => {
    const lines = [{ amtSourceDr: '100', amtSourceCr: '0' }, { amtSourceDr: '0', amtSourceCr: '60' }];
    render(<BalanceFooterPanel lines={lines} config={cfg} formatAmount={fmt} />);
    expect(screen.getByTestId('balance-total-debit')).toHaveTextContent('€100.00');
    expect(screen.getByTestId('balance-total-credit')).toHaveTextContent('€60.00');
    expect(screen.queryByTestId('balance-difference')).toBeNull();
    expect(screen.queryByTestId('balance-status')).toBeNull();
  });

  it('renders zero totals for an empty draft, with no difference/badge', () => {
    render(<BalanceFooterPanel lines={[]} config={cfg} formatAmount={fmt} />);
    expect(screen.getByTestId('balance-total-debit')).toHaveTextContent('€0.00');
    expect(screen.getByTestId('balance-total-credit')).toHaveTextContent('€0.00');
    expect(screen.queryByTestId('balance-difference')).toBeNull();
    expect(screen.queryByTestId('balance-status')).toBeNull();
  });
});
