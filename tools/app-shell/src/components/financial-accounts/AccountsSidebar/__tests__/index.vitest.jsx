// @covers tools/app-shell/src/components/financial-accounts/AccountsSidebar/index.jsx
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
  useUI: () => (key, params = {}) => {
    const map = {
      financeAccountsBalanceTitle: 'Saldo',
      financeAccountsBalanceInfo: 'Info',
      financeAccountsBalanceByCurrency: 'Por moneda',
      financeAccountsBalanceEmpty: 'Sin saldos',
      financeAccountsPendingTitle: 'Pendientes',
      // Label no longer includes the count — the count shows as the right-side value.
      financeAccountsPendingAccountsRow: 'Cuentas con pendientes',
    };
    return map[key] ?? key;
  },
}));

import { AccountsSidebar } from '../index.jsx';

const baseSummary = {
  totalBalance: 1250.5,
  byCurrency: [
    { currencyIso: 'EUR', total: 1000 },
    { currencyIso: 'USD', total: 250.5 },
  ],
  pending: { accountsWithPending: 3, suggestionsReady: 2, byRule: 1 },
};

describe('AccountsSidebar — no sync pill', () => {
  it('does not render any sync/updated label in the header', () => {
    render(<AccountsSidebar summary={baseSummary} loading={false} />);
    expect(screen.queryByTestId('sidebar-last-sync')).not.toBeInTheDocument();
    expect(screen.queryByText(/Actualizado/)).not.toBeInTheDocument();
  });
});

describe('AccountsSidebar', () => {
  it('renders the Saldo header and the formatted total balance', () => {
    render(<AccountsSidebar summary={baseSummary} loading={false} />);
    expect(screen.getByText('Saldo')).toBeInTheDocument();
    expect(screen.getByTestId('balance-card')).toBeInTheDocument();
  });

  it('renders one row per currency in the breakdown card', () => {
    render(<AccountsSidebar summary={baseSummary} loading={false} />);
    expect(screen.getByTestId('balance-by-currency-EUR')).toBeInTheDocument();
    expect(screen.getByTestId('balance-by-currency-USD')).toBeInTheDocument();
  });

  it('renders the pending-accounts row with its label and count value', () => {
    render(<AccountsSidebar summary={baseSummary} loading={false} />);
    const card = screen.getByTestId('pending-reconcile-card');
    // Label no longer carries the count; the count appears as the right-side value.
    expect(card).toHaveTextContent('Cuentas con pendientes');
    expect(card).toHaveTextContent('3');
    // The removed "Sugerencias listas" / "Por regla" indicators are gone.
    expect(card).not.toHaveTextContent('Sugerencias');
    expect(card).not.toHaveTextContent('Por regla');
  });

  it('shows an em-dash placeholder while loading is true', () => {
    render(<AccountsSidebar summary={null} loading={true} />);
    expect(screen.getByTestId('balance-card')).toHaveTextContent('—');
  });

  it('falls back to a single empty currency row when there are no accounts', () => {
    render(
      <AccountsSidebar
        summary={{ totalBalance: 0, byCurrency: [], pending: {} }}
        loading={false}
      />,
    );
    expect(screen.getByTestId('balance-by-currency-EUR')).toBeInTheDocument();
  });
});
