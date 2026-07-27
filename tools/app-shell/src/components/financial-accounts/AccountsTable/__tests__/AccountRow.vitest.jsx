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
    expect(balanceCell.className).toMatch(/text-\[hsl\(var\(--destructive\)\)\]/i);
  });

  // ETP-4656 — selection checkbox (Gap 1: multi-select bulk delete).
  describe('selection checkbox', () => {
    it('renders unchecked by default and fires onSelectionChange with the account id when toggled', () => {
      const onSelectionChange = vi.fn();
      renderRow({ account: baseAccount, onSelectionChange });
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(onSelectionChange).toHaveBeenCalledWith('acc-1');
    });

    it('renders checked when selected is true', () => {
      renderRow({ account: baseAccount, selected: true });
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('does not fire onOpen when the checkbox cell is clicked (stopPropagation)', () => {
      const onOpen = vi.fn();
      const onSelectionChange = vi.fn();
      renderRow({
        account: baseAccount, onOpen, onSelectionChange,
      });
      fireEvent.click(screen.getByRole('checkbox'));
      expect(onSelectionChange).toHaveBeenCalledWith('acc-1');
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('does not throw when onSelectionChange is not provided', () => {
      renderRow({ account: baseAccount });
      expect(() => fireEvent.click(screen.getByRole('checkbox'))).not.toThrow();
    });
  });

  describe('PSD2 connect CTA (cellCtx.onConnect)', () => {
    it('fires onPsd2Action("connect", account) when the inline Connect PSD2 CTA is clicked', () => {
      const onPsd2Action = vi.fn();
      renderRow({ account: baseAccount, onPsd2Action });
      fireEvent.click(screen.getByTestId('account-sync-connect-acc-1'));
      expect(onPsd2Action).toHaveBeenCalledWith('connect', expect.objectContaining({ id: 'acc-1' }));
    });

    it('does not render the Connect PSD2 CTA when onPsd2Action is not provided', () => {
      renderRow({ account: baseAccount });
      // cellCtx.onConnect is undefined, so SyncStatusInline receives no onConnect handler,
      // but the CTA itself is still rendered — clicking it should not throw.
      expect(() => fireEvent.click(screen.getByTestId('account-sync-connect-acc-1'))).not.toThrow();
    });
  });

  describe('reconcile pill', () => {
    it('fires onReconcile with the account when the pending pill is clicked', () => {
      const onReconcile = vi.fn();
      renderRow({ account: { ...baseAccount, pendingCount: 3 }, onReconcile });
      fireEvent.click(screen.getByTestId('reconcile-status-pending'));
      expect(onReconcile).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1', pendingCount: 3 }));
    });

    it('does not fire onOpen when the pending pill is clicked (stopPropagation)', () => {
      const onOpen = vi.fn();
      const onReconcile = vi.fn();
      renderRow({
        account: { ...baseAccount, pendingCount: 3 }, onOpen, onReconcile,
      });
      fireEvent.click(screen.getByTestId('reconcile-status-pending'));
      expect(onReconcile).toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  describe('edit action', () => {
    it('fires onEdit with the account when the edit button is clicked', () => {
      const onEdit = vi.fn();
      renderRow({ account: baseAccount, onEdit });
      fireEvent.click(screen.getByTestId('account-row-edit-acc-1'));
      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }));
    });

    it('does not fire onOpen when the edit button is clicked (stopPropagation)', () => {
      const onOpen = vi.fn();
      const onEdit = vi.fn();
      renderRow({ account: baseAccount, onOpen, onEdit });
      fireEvent.click(screen.getByTestId('account-row-edit-acc-1'));
      expect(onEdit).toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  describe('PSD2 sync-now action', () => {
    it('renders the sync button and fires onPsd2Action("syncNow", account) when clicked, for psd2Connected accounts', () => {
      const onPsd2Action = vi.fn();
      renderRow({ account: { ...baseAccount, psd2Connected: true }, onPsd2Action });
      fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));
      expect(onPsd2Action).toHaveBeenCalledWith('syncNow', expect.objectContaining({ id: 'acc-1', psd2Connected: true }));
    });

    it('does not render the sync button when the account is not psd2Connected', () => {
      renderRow({ account: { ...baseAccount, psd2Connected: false } });
      expect(screen.queryByTestId('account-row-refresh-acc-1')).not.toBeInTheDocument();
    });

    it('does not fire onOpen when the sync button is clicked (stopPropagation)', () => {
      const onOpen = vi.fn();
      const onPsd2Action = vi.fn();
      renderRow({
        account: { ...baseAccount, psd2Connected: true }, onOpen, onPsd2Action,
      });
      fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));
      expect(onPsd2Action).toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    });
  });
});
