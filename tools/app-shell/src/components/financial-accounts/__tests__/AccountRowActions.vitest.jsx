/**
 * AccountRowActions — the Cuentas row hover actions.
 *
 * ETP-4658 extracted these out of `AccountsTable/AccountRow.jsx` so the same actions render
 * in both table hosts: the generic DataTable (through the `_rowActions` synthetic column in
 * `AccountsHeaderTable`) and the legacy hand-rolled `AccountsTable`. The extraction must keep
 * ONE definition of the per-row testids (`account-row-edit-{id}`, `account-row-refresh-{id}`)
 * and of the sync-visibility rule (bank-connected accounts only), which is what this covers.
 */
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { AccountRowActions } from '../AccountRowActions.jsx';

const CONNECTED = { id: 'acc-1', name: 'BBVA', type: 'B', bankConnected: true };
const OFFLINE = { id: 'acc-2', name: 'Sabadell', type: 'B', bankConnected: false };
const CASH = { id: 'acc-3', name: 'Caja', type: 'C' };

/** Opens the kebab so its menu items mount (Radix renders the content on demand). */
function openMenu(id) {
  fireEvent.pointerDown(
    screen.getByTestId(`account-row-menu-trigger-${id}`),
    { button: 0, ctrlKey: false, pointerType: 'mouse' },
  );
}

describe('AccountRowActions', () => {
  it('renders the edit button and the kebab trigger with per-row testids', () => {
    render(<AccountRowActions account={CONNECTED} />);

    expect(screen.getByTestId('account-row-edit-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-menu-trigger-acc-1')).toBeInTheDocument();
  });

  it('gives the icon-only buttons an accessible label', () => {
    render(<AccountRowActions account={CONNECTED} />);

    expect(screen.getByTestId('account-row-edit-acc-1'))
      .toHaveAttribute('aria-label', 'financeAccountsMenuEdit');
    expect(screen.getByTestId('account-row-refresh-acc-1'))
      .toHaveAttribute('aria-label', 'financeAccountsMenuSyncNow');
  });

  it('shows the sync button only for bank-connected accounts', () => {
    render(<AccountRowActions account={CONNECTED} />);
    expect(screen.getByTestId('account-row-refresh-acc-1')).toBeInTheDocument();
  });

  it('hides the sync button for an offline account', () => {
    render(<AccountRowActions account={OFFLINE} />);
    expect(screen.queryByTestId('account-row-refresh-acc-2')).not.toBeInTheDocument();
  });

  it('hides the sync button for a cash account (no bankConnected flag at all)', () => {
    render(<AccountRowActions account={CASH} />);
    expect(screen.queryByTestId('account-row-refresh-acc-3')).not.toBeInTheDocument();
  });

  it('calls onEdit with the account when the edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<AccountRowActions account={CONNECTED} onEdit={onEdit} />);

    fireEvent.click(screen.getByTestId('account-row-edit-acc-1'));

    expect(onEdit).toHaveBeenCalledWith(CONNECTED);
  });

  it('calls onBankConnectionAction with syncNow when the sync button is clicked', () => {
    const onBankConnectionAction = vi.fn();
    render(<AccountRowActions account={CONNECTED} onBankConnectionAction={onBankConnectionAction} />);

    fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));

    expect(onBankConnectionAction).toHaveBeenCalledWith('syncNow', CONNECTED);
  });

  it('does not throw when the callbacks are omitted', () => {
    render(<AccountRowActions account={CONNECTED} />);

    fireEvent.click(screen.getByTestId('account-row-edit-acc-1'));
    fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));

    expect(screen.getByTestId('account-row-edit-acc-1')).toBeInTheDocument();
  });

  it('forwards every handler to the kebab menu', async () => {
    const handlers = {
      onOpen: vi.fn(), onEdit: vi.fn(), onArchive: vi.fn(),
      onBankConnectionAction: vi.fn(), onTransfer: vi.fn(), onNewMovement: vi.fn(),
    };
    render(<AccountRowActions account={CONNECTED} {...handlers} />);
    openMenu('acc-1');

    fireEvent.click(await screen.findByTestId('account-row-menu-open-acc-1'));
    expect(handlers.onOpen).toHaveBeenCalledWith(CONNECTED);

    openMenu('acc-1');
    fireEvent.click(await screen.findByTestId('account-row-menu-transfer-acc-1'));
    expect(handlers.onTransfer).toHaveBeenCalledWith(CONNECTED);

    openMenu('acc-1');
    fireEvent.click(await screen.findByTestId('account-row-menu-new-movement-acc-1'));
    expect(handlers.onNewMovement).toHaveBeenCalledWith(CONNECTED);

    openMenu('acc-1');
    fireEvent.click(await screen.findByTestId('account-row-menu-archive-acc-1'));
    expect(handlers.onArchive).toHaveBeenCalledWith(CONNECTED);
  });

  it('offers disconnect for a connected account and connect for an offline one', async () => {
    const onBankConnectionAction = vi.fn();
    const { unmount } = render(
      <AccountRowActions account={CONNECTED} onBankConnectionAction={onBankConnectionAction} />,
    );
    openMenu('acc-1');
    fireEvent.click(await screen.findByTestId('account-row-menu-disconnect-acc-1'));
    expect(onBankConnectionAction).toHaveBeenCalledWith('disconnect', CONNECTED);
    unmount();

    render(<AccountRowActions account={OFFLINE} onBankConnectionAction={onBankConnectionAction} />);
    openMenu('acc-2');
    fireEvent.click(await screen.findByTestId('account-row-menu-connect-acc-2'));
    expect(onBankConnectionAction).toHaveBeenCalledWith('connect', OFFLINE);
  });
});
