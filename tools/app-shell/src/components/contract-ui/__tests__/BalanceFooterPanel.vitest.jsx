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
  it('shows balanced badge when debit equals credit', () => {
    const lines = [{ amtSourceDr: '100', amtSourceCr: '0' }, { amtSourceDr: '0', amtSourceCr: '100' }];
    render(<BalanceFooterPanel lines={lines} config={cfg} formatAmount={fmt} />);
    expect(screen.getByTestId('balance-status')).toHaveAttribute('data-balanced', 'true');
    expect(screen.getByTestId('balance-total-debit')).toHaveTextContent('€100.00');
    expect(screen.getByTestId('balance-total-credit')).toHaveTextContent('€100.00');
  });

  it('shows unbalanced badge and difference when totals differ', () => {
    const lines = [{ amtSourceDr: '100', amtSourceCr: '0' }, { amtSourceDr: '0', amtSourceCr: '60' }];
    render(<BalanceFooterPanel lines={lines} config={cfg} formatAmount={fmt} />);
    expect(screen.getByTestId('balance-status')).toHaveAttribute('data-balanced', 'false');
    expect(screen.getByTestId('balance-difference')).toHaveTextContent('€40.00');
  });

  it('hides the badge entirely when there are no amounts (empty draft)', () => {
    render(<BalanceFooterPanel lines={[]} config={cfg} formatAmount={fmt} />);
    // No red/green chip on a brand-new empty journal.
    expect(screen.queryByTestId('balance-status')).toBeNull();
    expect(screen.getByTestId('balance-difference')).toHaveTextContent('€0.00');
  });
});
