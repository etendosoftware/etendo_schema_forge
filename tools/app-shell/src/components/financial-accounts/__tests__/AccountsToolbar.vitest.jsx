import { render, screen, fireEvent } from '@testing-library/react';

const toast = vi.fn();
vi.mock('sonner', () => ({
  toast: (...args) => toast(...args),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      financeAccountsFilterAll: 'Todas las cuentas',
      financeAccountsSearchPlaceholder: 'Buscar cuenta…',
      financeAccountsMatchingRules: 'Reglas de matcheo',
      financeAccountsNewAccount: 'Nueva cuenta',
      financeAccountsRulesToast: 'Próximamente en T5',
      financeAccountsTypeBank: 'Banco',
      financeAccountsTypeCash: 'Caja',
      financeAccountsTypeCard: 'Tarjeta',
    };
    return map[key] ?? key;
  },
}));

import { AccountsToolbar } from '../AccountsToolbar.jsx';

describe('AccountsToolbar', () => {
  beforeEach(() => {
    toast.mockReset();
  });

  it('renders the type filter, search input, matching rules and new account buttons', () => {
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('account-type-filter-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-matching-rules-button')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-new-account-button')).toBeInTheDocument();
  });

  it('reports search input changes back to the parent', () => {
    const onSearchChange = vi.fn();
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={onSearchChange}
      />,
    );
    fireEvent.change(screen.getByTestId('cuentas-search-input'), {
      target: { value: 'BBVA' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('BBVA');
  });

  it('calls onMatchingRules when "Reglas de matcheo" is clicked', () => {
    const onMatchingRules = vi.fn();
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        onMatchingRules={onMatchingRules}
      />,
    );
    fireEvent.click(screen.getByTestId('cuentas-matching-rules-button'));
    expect(onMatchingRules).toHaveBeenCalledTimes(1);
  });

  it('does not render the advanced ("by conditions") filter', () => {
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('cuentas-advanced-filter')).not.toBeInTheDocument();
  });

  // This window hides ListView's idle bar and draws its own toolbar, so the generic
  // refresh button is reproduced here (same reason as `sortControl`).
  it('renders the refresh button', () => {
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    const button = screen.getByTestId('finance-refresh-button');
    expect(button).toBeInTheDocument();
    // Icon-only: the accessible name comes from the i18n key, never a hardcoded string.
    expect(button).toHaveAttribute('aria-label', 'refresh');
    expect(button).toHaveAttribute('title', 'refresh');
  });

  it('calls onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByTestId('finance-refresh-button'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders the refresh button between the sort control and the matching-rules button', () => {
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        onRefresh={vi.fn()}
        sortControl={<button type="button" data-testid="sort-control">sort</button>}
      />,
    );
    const toolbar = screen.getByTestId('cuentas-toolbar');
    const order = ['sort-control', 'finance-refresh-button', 'cuentas-matching-rules-button']
      .map((id) => [...toolbar.querySelectorAll('[data-testid]')]
        .indexOf(screen.getByTestId(id)));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('keeps the "Nueva cuenta" button enabled with no click handler in T1', () => {
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    const button = screen.getByTestId('cuentas-new-account-button');
    expect(button).not.toBeDisabled();
  });
});
