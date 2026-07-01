import { render, screen, fireEvent } from '@testing-library/react';
import { Table, TableBody } from '@/components/ui/table';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    const map = {
      financeAccountsReconcilePending: `Conciliar (${params.count})`,
      financeAccountsStatusReconciled: 'Conciliado',
      financeAccountsTypeBank: 'Banco',
      financeAccountsTypeCash: 'Caja',
      financeAccountsTypeCard: 'Tarjeta',
      financeAccountsBadgeOffline: 'Sin conexión',
      financeAccountsCopyIban: 'Copiar IBAN',
      financeAccountsConnectPsd2: 'Conectar PSD2',
      financeAccountsSyncedJustNow: 'Sincronizado',
      financeAccountsRowMenuLabel: 'Acciones',
      financeAccountsMenuOpen: 'Abrir cuenta',
      financeAccountsMenuEdit: 'Editar',
      financeAccountsMenuSyncNow: 'Sincronizar',
      financeAccountsMenuConnect: 'Conectar',
      financeAccountsMenuDisconnect: 'Desconectar',
      financeAccountsMenuArchive: 'Archivar',
    };
    return map[key] ?? key;
  },
}));

import { AccountRow } from '../AccountRow.jsx';

function renderRow(props) {
  return render(
    <Table>
      <TableBody>
        <AccountRow {...props} />
      </TableBody>
    </Table>,
  );
}

const baseAccount = {
  id: 'acc-1',
  name: 'BBVA Principal',
  type: 'B',
  currentBalance: 1234.56,
  currencyIso: 'EUR',
  iban: 'ES1200001234567890123456',
  pendingCount: 0,
  psd2Connected: false,
};

describe('AccountRow', () => {
  it('renders the account name and the offline badge for unconnected accounts', () => {
    renderRow({ account: baseAccount });
    const row = screen.getByTestId('account-row-acc-1');
    expect(row).toHaveTextContent('BBVA Principal');
    expect(row).toHaveTextContent('Sin conexión');
  });

  it('shows the reconciled badge when pendingCount is zero', () => {
    renderRow({ account: { ...baseAccount, pendingCount: 0 } });
    expect(screen.getByTestId('reconcile-status-reconciled')).toBeInTheDocument();
  });

  it('shows the pending pill with the count when pendingCount is positive', () => {
    renderRow({ account: { ...baseAccount, pendingCount: 4 } });
    expect(screen.getByTestId('reconcile-status-pending')).toHaveTextContent('Conciliar (4)');
  });

  it('fires onOpen when the row body is clicked', () => {
    const onOpen = vi.fn();
    renderRow({ account: baseAccount, onOpen });
    fireEvent.click(screen.getByTestId('account-row-acc-1'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }));
  });

  it('does not fire onOpen when the kebab cell is clicked', () => {
    const onOpen = vi.fn();
    renderRow({ account: baseAccount, onOpen });
    fireEvent.click(screen.getByTestId('account-row-menu-trigger-acc-1'));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('renders the type label and the IBAN chunked in groups of four', () => {
    renderRow({ account: baseAccount });
    expect(screen.getByText('Banco')).toBeInTheDocument();
    expect(screen.getByText(/ES12 0000 1234 5678 9012 3456/)).toBeInTheDocument();
  });

  it('renders the PSD2 masked card number for card accounts (no IBAN)', () => {
    renderRow({
      account: {
        ...baseAccount, type: 'CA', iban: '', maskedPan: '**** **** **** 1234',
      },
    });
    expect(screen.getByTestId('account-row-card-number-acc-1')).toHaveTextContent('**** **** **** 1234');
  });

  it('falls back to an em dash for a card without a masked PAN', () => {
    renderRow({ account: { ...baseAccount, type: 'CA', iban: '', maskedPan: '' } });
    expect(screen.queryByTestId('account-row-card-number-acc-1')).not.toBeInTheDocument();
  });

  it('renders negative balances in the red treatment', () => {
    renderRow({ account: { ...baseAccount, currentBalance: -42.5 } });
    const balanceCell = screen.getByText(/-?€42\.50|-€42\.50|-42,50 €|-42\.50 €/);
    expect(balanceCell.className).toMatch(/text-\[#D50B3E\]/i);
  });
});
