import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    if (key === 'financeAccountsReconcilePending') return `Conciliar (${params.count})`;
    const map = {
      financeAccountsColAccount: 'Cuenta',
      financeAccountsColType: 'Tipo',
      financeAccountsColBalance: 'Saldo',
      financeAccountsColPending: 'Por conciliar',
      financeAccountsLoadError: 'Error al cargar',
      financeAccountsRetry: 'Reintentar',
      financeAccountsEmpty: 'Sin cuentas',
      financeAccountsStatusReconciled: 'Conciliado',
      financeAccountsTypeBank: 'Banco',
      financeAccountsTypeCash: 'Caja',
      financeAccountsTypeCard: 'Tarjeta',
      financeAccountsBadgeOffline: 'Sin conexión',
      financeAccountsConnectPsd2: 'Conectar PSD2',
      financeAccountsCopyIban: 'Copiar IBAN',
      financeAccountsRowRefresh: 'Sincronizar',
      financeAccountsRowMenuLabel: 'Acciones',
      financeAccountsMenuOpen: 'Abrir',
      financeAccountsMenuEdit: 'Editar',
      financeAccountsMenuSyncNow: 'Sync',
      financeAccountsMenuConnect: 'Conectar',
      financeAccountsMenuDisconnect: 'Desconectar',
      financeAccountsMenuArchive: 'Archivar',
    };
    return map[key] ?? key;
  },
}));

import { AccountsTable } from '../index.jsx';

const accounts = [
  {
    id: 'acc-1',
    name: 'BBVA',
    type: 'B',
    currentBalance: 1500,
    currencyIso: 'EUR',
    pendingCount: 0,
    psd2Connected: true,
  },
  {
    id: 'acc-2',
    name: 'Caja',
    type: 'C',
    currentBalance: 0,
    currencyIso: 'EUR',
    pendingCount: 0,
  },
];

describe('AccountsTable', () => {
  it('renders all rows when accounts are provided', () => {
    render(<AccountsTable accounts={accounts} loading={false} error={null} />);
    expect(screen.getByTestId('account-row-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-2')).toBeInTheDocument();
  });

  it('renders the skeleton rows when loading is true', () => {
    const { container } = render(
      <AccountsTable accounts={[]} loading={true} error={null} />,
    );
    // 5 skeleton rows + header → at least 6 rows
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });

  it('renders the empty state when there are no accounts', () => {
    render(<AccountsTable accounts={[]} loading={false} error={null} />);
    expect(screen.getByText('Sin cuentas')).toBeInTheDocument();
  });

  it('renders the error state with retry button when error is set', () => {
    const onRetry = vi.fn();
    render(
      <AccountsTable
        accounts={[]}
        loading={false}
        error={new Error('boom')}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Error al cargar')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reintentar'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render the retry button when onRetry is missing', () => {
    render(
      <AccountsTable accounts={[]} loading={false} error={new Error('boom')} />,
    );
    expect(screen.queryByText('Reintentar')).not.toBeInTheDocument();
  });

  // ETP-4656 — handleSelectAll (header checkbox select-all/deselect-all toggle).
  // onSelectionChange is a per-id toggle callback (not a "set" callback), so both
  // branches call it once per affected account — they differ in WHICH ids they toggle.
  describe('select all / deselect all', () => {
    it('when none are selected, toggles every currently-unselected account (selects the rest)', () => {
      const onSelectionChange = vi.fn();
      render(
        <AccountsTable
          accounts={accounts}
          loading={false}
          error={null}
          selectedIds={new Set()}
          onSelectionChange={onSelectionChange}
        />,
      );
      fireEvent.click(screen.getByTestId('account-select-all'));
      expect(onSelectionChange).toHaveBeenCalledTimes(2);
      expect(onSelectionChange).toHaveBeenCalledWith('acc-1');
      expect(onSelectionChange).toHaveBeenCalledWith('acc-2');
    });

    it('when some are selected, toggles only the currently-unselected accounts', () => {
      const onSelectionChange = vi.fn();
      render(
        <AccountsTable
          accounts={accounts}
          loading={false}
          error={null}
          selectedIds={new Set(['acc-1'])}
          onSelectionChange={onSelectionChange}
        />,
      );
      fireEvent.click(screen.getByTestId('account-select-all'));
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      expect(onSelectionChange).toHaveBeenCalledWith('acc-2');
    });

    it('when all are selected, toggles every account (deselects all)', () => {
      const onSelectionChange = vi.fn();
      render(
        <AccountsTable
          accounts={accounts}
          loading={false}
          error={null}
          selectedIds={new Set(['acc-1', 'acc-2'])}
          onSelectionChange={onSelectionChange}
        />,
      );
      fireEvent.click(screen.getByTestId('account-select-all'));
      expect(onSelectionChange).toHaveBeenCalledTimes(2);
      expect(onSelectionChange).toHaveBeenCalledWith('acc-1');
      expect(onSelectionChange).toHaveBeenCalledWith('acc-2');
    });
  });
});
