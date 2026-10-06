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

  // AdvancedFilterButton renders nothing without an onChange handler (its own guard), so a
  // caller that does not own condition-tree state gets no funnel at all.
  it('does not render the advanced ("by conditions") filter without a change handler', () => {
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

  // ETP-5113 — the funnel is wired in the Cuentas list. The popover contents belong to
  // AdvancedFilterBuilder's own suite; what this toolbar owns is the trigger.
  it('renders the advanced filter when the parent owns the condition state', () => {
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        advancedFilter={null}
        onAdvancedFilterChange={vi.fn()}
      />,
    );
    const trigger = screen.getByTestId('cuentas-advanced-filter');
    expect(trigger).toBeInTheDocument();
    // Icon-only + label, both resolved through i18n keys — never a hardcoded string.
    expect(trigger).toHaveAttribute('title', 'advancedFilterTitle');
    expect(trigger).toHaveTextContent('filters');
  });

  // The button's own base height is h-9 (see docs/list-filters.md "Visual parity"); every
  // control in THIS toolbar is 40px tall, so the window passes h-10 explicitly.
  it('overrides the funnel height to match the rest of the toolbar', () => {
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        onAdvancedFilterChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cuentas-advanced-filter').className).toContain('h-10');
  });

  it('places the funnel immediately after the account-type filter', () => {
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        onAdvancedFilterChange={vi.fn()}
      />,
    );
    const toolbar = screen.getByTestId('cuentas-toolbar');
    const nodes = [...toolbar.querySelectorAll('[data-testid]')];
    const typeIndex = nodes.indexOf(screen.getByTestId('account-type-filter-trigger'));
    const funnelIndex = nodes.indexOf(screen.getByTestId('cuentas-advanced-filter'));
    const searchIndex = nodes.indexOf(screen.getByTestId('cuentas-search-input'));
    expect(typeIndex).toBeLessThan(funnelIndex);
    expect(funnelIndex).toBeLessThan(searchIndex);
  });

  it('badges the funnel with the number of active conditions', () => {
    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        advancedFilter={{
          rowOperator: 'and',
          conditions: [
            { field: 'currencyIso', operator: 'equals', value: 'EUR' },
            { field: 'currentBalance', operator: 'greaterThan', value: 0 },
          ],
        }}
        onAdvancedFilterChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cuentas-advanced-filter')).toHaveTextContent('2');
  });

  it('renders no condition badge while the filter is empty', () => {
    const { unmount } = render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        advancedFilter={{ rowOperator: 'and', conditions: [] }}
        onAdvancedFilterChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cuentas-advanced-filter')).not.toHaveTextContent(/\d/);
    unmount();

    render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        advancedFilter={null}
        onAdvancedFilterChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cuentas-advanced-filter')).not.toHaveTextContent(/\d/);
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

// ETP-5457 — the financial-account window's "read-only" access tier. "Nueva cuenta" is the
// toolbar's only write entry point, so it is the only control `windowReadOnly` removes; filters,
// search, sort and refresh are reading tools and stay. "Reglas de matcheo" navigates to ANOTHER
// window, so it follows `showMatchingRules` (the caller's view of the match-rule tier) and is
// independent of `windowReadOnly`. Every read-only case has a full-access twin.
describe('AccountsToolbar — read-only access tier (ETP-5457)', () => {
  function renderToolbar(props = {}) {
    return render(
      <AccountsToolbar
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        advancedFilter={null}
        onAdvancedFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        sortControl={<button type="button" data-testid="sort-slot">sort</button>}
        {...props}
      />,
    );
  }

  it('hides "Nueva cuenta" under the read-only tier (ETP-5457)', () => {
    renderToolbar({ windowReadOnly: true, onNewAccount: vi.fn() });

    expect(screen.queryByTestId('cuentas-new-account-button')).not.toBeInTheDocument();
    expect(screen.queryByText('Nueva cuenta')).not.toBeInTheDocument();
  });

  it('shows "Nueva cuenta" and wires its click under full access (ETP-5457 twin)', () => {
    const onNewAccount = vi.fn();
    renderToolbar({ windowReadOnly: false, onNewAccount });

    fireEvent.click(screen.getByTestId('cuentas-new-account-button'));

    expect(onNewAccount).toHaveBeenCalledTimes(1);
  });

  it('defaults windowReadOnly to false, keeping "Nueva cuenta" for other callers (ETP-5457)', () => {
    renderToolbar();

    expect(screen.getByTestId('cuentas-new-account-button')).toBeInTheDocument();
  });

  it('keeps every reading control under the read-only tier (ETP-5457)', () => {
    const onSearchChange = vi.fn();
    const onRefresh = vi.fn();
    renderToolbar({ windowReadOnly: true, onSearchChange, onRefresh });

    expect(screen.getByTestId('account-type-filter-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-advanced-filter')).toBeInTheDocument();
    expect(screen.getByTestId('sort-slot')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('cuentas-search-input'), { target: { value: 'BBVA' } });
    fireEvent.click(screen.getByTestId('finance-refresh-button'));

    expect(onSearchChange).toHaveBeenCalledWith('BBVA');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the same reading controls under full access (ETP-5457 twin)', () => {
    renderToolbar({ windowReadOnly: false });

    expect(screen.getByTestId('account-type-filter-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-advanced-filter')).toBeInTheDocument();
    expect(screen.getByTestId('sort-slot')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('finance-refresh-button')).toBeInTheDocument();
  });

  it('shows "Reglas de matcheo" by default when showMatchingRules is not passed (ETP-5457)', () => {
    renderToolbar();

    expect(screen.getByTestId('cuentas-matching-rules-button')).toBeInTheDocument();
  });

  // The button's visibility is decided by showMatchingRules alone — windowReadOnly never touches it.
  it.each([
    { windowReadOnly: true, showMatchingRules: false, visible: false },
    { windowReadOnly: true, showMatchingRules: true, visible: true },
    { windowReadOnly: false, showMatchingRules: false, visible: false },
    { windowReadOnly: false, showMatchingRules: true, visible: true },
  ])(
    'windowReadOnly=$windowReadOnly + showMatchingRules=$showMatchingRules → "Reglas de matcheo" visible=$visible (ETP-5457)',
    ({ windowReadOnly, showMatchingRules, visible }) => {
      renderToolbar({ windowReadOnly, showMatchingRules });

      if (visible) {
        expect(screen.getByTestId('cuentas-matching-rules-button')).toBeInTheDocument();
      } else {
        expect(screen.queryByTestId('cuentas-matching-rules-button')).not.toBeInTheDocument();
      }
    },
  );

  it('still navigates through onMatchingRules under the read-only tier (ETP-5457)', () => {
    const onMatchingRules = vi.fn();
    renderToolbar({ windowReadOnly: true, showMatchingRules: true, onMatchingRules });

    fireEvent.click(screen.getByTestId('cuentas-matching-rules-button'));

    expect(onMatchingRules).toHaveBeenCalledTimes(1);
  });
});
