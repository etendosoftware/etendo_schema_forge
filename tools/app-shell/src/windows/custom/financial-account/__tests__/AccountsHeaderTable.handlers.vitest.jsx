/**
 * AccountsHeaderTable — handler wiring.
 *
 * ETP-4658: re-homes the handler half of the retired
 * `pages/__tests__/FinancialAccountsPage.handlers.vitest.jsx` suite. The behaviour is
 * unchanged (bank connection connect/sync/disconnect, the edit → archive / edit → connect chain,
 * the archive dialog, the funds-transfer modal, and the reconcile / new-movement
 * deep links); only the host moved from the page to this `headerTable` slot.
 *
 * The handlers used to be reachable through the page's `AccountsTable` props. They now
 * reach the cells through the `cellCtx` the slot builds: `eTGOPendingCount` renders through
 * the `reconcilePill` entry of ACCOUNT_CELL_TYPES (a contract column since the
 * `virtualFields[]` declaration), `_rowActions` is the one hand-appended column. Both are
 * handed to the generic DataTable, so this suite stubs it with a renderer that calls
 * `col.render` for
 * every row — the real `ReconcilePill` / `AccountRowActions` then drive the handlers
 * exactly as they do in the browser.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  // ListSortPopover (rendered in the toolbar since ETP-4921) resolves each menu entry
  // through resolveColumnLabel, which needs the AD dictionary translator.
  useLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const toastError = vi.fn();
const toastInfo = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...a) => toastError(...a),
    info: (...a) => toastInfo(...a),
    success: (...a) => toastSuccess(...a),
  },
}));

const mockSync = vi.fn();
const mockDisconnect = vi.fn();
vi.mock('@/hooks/useBankConnectionActions.js', () => ({
  useBankConnectionActions: () => ({ sync: mockSync, disconnect: mockDisconnect }),
  launchSaltEdgePopup: vi.fn(),
}));

const mockStartConnect = vi.fn();
const mockStartCreate = vi.fn();
let bankConnectionFlowOnDone = null;
vi.mock('@/hooks/useBankConnectionFlow.js', () => ({
  useBankConnectionFlow: ({ onDone } = {}) => {
    bankConnectionFlowOnDone = onDone;
    return { startConnect: mockStartConnect, startCreate: mockStartCreate };
  },
}));

// Sidebar/toolbar are exercised by the sibling suite; stub them so the DOM stays small.
// AccountTypeFilter is a real enum consumed by filterAccounts — keep the real module.
vi.mock('@/components/financial-accounts', async () => {
  const actual = await vi.importActual('@/components/financial-accounts');
  return {
    AccountTypeFilter: actual.AccountTypeFilter,
    AccountsSidebar: () => <div data-testid="sidebar" />,
    AccountsToolbar: (props) => (
      <button type="button" data-testid="toolbar-new-account" onClick={props.onNewAccount}>new</button>
    ),
  };
});

let wizardProps = null;
vi.mock('@/windows/custom/financial-account/NewAccountWizard.jsx', () => ({
  NewAccountWizard: (props) => {
    wizardProps = props;
    return <div data-testid="wizard" data-open={String(props.open)} />;
  },
}));
let editModalProps = null;
vi.mock('@/windows/custom/financial-account/EditAccountModal.jsx', () => ({
  EditAccountModal: (props) => {
    editModalProps = props;
    return <div data-testid="edit-modal" data-open={String(props.open)} />;
  },
}));
let archiveDialogProps = null;
vi.mock('@/windows/custom/financial-account/ArchiveAccountDialog.jsx', () => ({
  ArchiveAccountDialog: (props) => {
    archiveDialogProps = props;
    return <div data-testid="archive-dialog" data-open={String(props.open)} />;
  },
}));
// ETP-4871 — a sibling of ArchiveAccountDialog, not a mode of it.
let deleteDialogProps = null;
vi.mock('@/windows/custom/financial-account/DeleteAccountDialog.jsx', () => ({
  DeleteAccountDialog: (props) => {
    deleteDialogProps = props;
    return <div data-testid="delete-dialog" data-open={String(props.open)} />;
  },
}));
vi.mock('@/windows/custom/financial-account/BankConnectionFlowUI.jsx', () => ({
  BankConnectionFlowUI: () => <div data-testid="bank-connection-flow" />,
}));
let transferModalProps = null;
vi.mock('@/windows/custom/financial-account/FundsTransferModal.jsx', () => ({
  FundsTransferModal: (props) => {
    transferModalProps = props;
    return <div data-testid="transfer-modal" data-source={props.sourceAccountId} />;
  },
}));

// See the sibling suite for why DataTable is stubbed rather than rendered for real.
vi.mock('@/components/contract-ui', () => ({
  DataTable: ({ columns, data, onNavigate }) => (
    <div data-testid="data-table">
      {(data ?? []).map((row) => (
        <div key={row.id} data-testid={`row-${row.id}`} role="presentation" onClick={() => onNavigate?.(row)}>
          {columns.map((col) => (
            <span key={col.key} data-testid={`cell-${col.key}-${row.id}`}>
              {col.render ? col.render(row) : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

import AccountsHeaderTable from '@generated/financial-account/custom/AccountsHeaderTable.jsx';

/** Bank-connected account: exposes the sync button and the disconnect menu item. */
const CONNECTED = {
  id: 'acc-1', name: 'BBVA', type: 'B', currentBalance: 0,
  currencyIso: 'EUR', eTGOPendingCount: 2, bankConnected: true, active: true,
};
/**
 * Offline bank account: exposes the "connect" affordances instead.
 * countryIso ES on purpose — those affordances are Spain-only since ETP-4896
 * (see saltEdgeEligibility.js), so without it they would not render at all.
 */
const OFFLINE = {
  id: 'acc-2', name: 'Sabadell', type: 'B', currentBalance: 0, countryIso: 'ES',
  currencyIso: 'EUR', eTGOPendingCount: 0, bankConnected: false, active: true,
};
/** ETP-4871 — zero dependent records anywhere: the row kebab offers a real delete. */
const DELETABLE = {
  id: 'acc-3', name: 'Empty Account', type: 'B', currentBalance: 0,
  currencyIso: 'EUR', eTGOPendingCount: 0, bankConnected: false, active: true, deletable: true,
};

const onDataMutated = vi.fn();

function renderTable(data = [CONNECTED, OFFLINE]) {
  return render(<AccountsHeaderTable data={data} meta={{ summary: null }} onDataMutated={onDataMutated} />);
}

/** Opens the kebab menu of a row so its menu items become clickable. */
function openRowMenu(id) {
  fireEvent.pointerDown(
    screen.getByTestId(`account-row-menu-trigger-${id}`),
    { button: 0, ctrlKey: false, pointerType: 'mouse' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  wizardProps = null;
  editModalProps = null;
  archiveDialogProps = null;
  deleteDialogProps = null;
  transferModalProps = null;
  bankConnectionFlowOnDone = null;
});

describe('AccountsHeaderTable — reconcile / new-movement navigation', () => {
  it('navigates to the reconciliation route with autoMatch from the pill', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('reconcile-status-pending'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/financial-account/acc-1?tab=reconciliation&autoMatch=true',
    );
  });

  it('navigates to the movements tab with newMovement from the row kebab', async () => {
    renderTable();
    openRowMenu('acc-1');

    fireEvent.click(await screen.findByTestId('account-row-menu-new-movement-acc-1'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/financial-account/acc-1?tab=movements&newMovement=true',
    );
  });

  it('opens the account detail from the row kebab', async () => {
    renderTable();
    openRowMenu('acc-1');

    fireEvent.click(await screen.findByTestId('account-row-menu-open-acc-1'));

    expect(mockNavigate).toHaveBeenCalledWith('/financial-account/acc-1');
  });
});

describe('AccountsHeaderTable — bank connection connect action', () => {
  it('starts the connect flow from the row kebab', async () => {
    renderTable();
    openRowMenu('acc-2');

    fireEvent.click(await screen.findByTestId('account-row-menu-connect-acc-2'));

    expect(mockStartConnect).toHaveBeenCalledWith(OFFLINE);
  });

  it('starts the connect flow from the inline "connect" link in the name cell', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('account-sync-connect-acc-2'));

    expect(mockStartConnect).toHaveBeenCalledWith(OFFLINE);
  });

  it('wires the wizard\'s "connect with creation" entry point to the same flow', () => {
    renderTable();

    expect(wizardProps.onConnectWithCreation).toBe(mockStartCreate);
  });

  it('refreshes the list when the connect flow completes', () => {
    renderTable();

    bankConnectionFlowOnDone?.();

    expect(onDataMutated).toHaveBeenCalled();
  });
});

describe('AccountsHeaderTable — bank connection sync action', () => {
  it('shows a success toast on an OK sync and refreshes the list', async () => {
    mockSync.mockResolvedValue({ status: 'OK', message: 'done' });
    renderTable();

    fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));

    await waitFor(() => expect(mockSync).toHaveBeenCalledWith('acc-1'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('done'));
    expect(onDataMutated).toHaveBeenCalled();
  });

  it('shows an info toast on a WARNING sync', async () => {
    mockSync.mockResolvedValue({ status: 'WARNING', message: 'partial' });
    renderTable();

    fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));

    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('partial'));
  });

  it('shows an error toast on an ERROR status', async () => {
    mockSync.mockResolvedValue({ status: 'ERROR', message: 'boom' });
    renderTable();

    fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('boom'));
  });

  it('falls back to a generic label when the sync returns no message', async () => {
    mockSync.mockResolvedValue({ status: 'OK' });
    renderTable();

    fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionSyncDone'));
  });

  it('shows an error toast when the sync throws', async () => {
    mockSync.mockRejectedValue(new Error('network'));
    renderTable();

    fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('network'));
  });

  it('is also reachable from the row kebab', async () => {
    mockSync.mockResolvedValue({ status: 'OK', message: 'done' });
    renderTable();
    openRowMenu('acc-1');

    fireEvent.click(await screen.findByTestId('account-row-menu-sync-acc-1'));

    await waitFor(() => expect(mockSync).toHaveBeenCalledWith('acc-1'));
  });
});

describe('AccountsHeaderTable — bank connection disconnect action', () => {
  async function requestDisconnect() {
    renderTable();
    openRowMenu('acc-1');
    fireEvent.click(await screen.findByTestId('account-row-menu-disconnect-acc-1'));
  }

  it('opens a styled confirm dialog and does not disconnect until it is confirmed', async () => {
    await requestDisconnect();

    // Despite the "Confirm" suffix, this key is the dialog's TITLE, not the button —
    // the confirm button itself renders `financeAccountsBankConnectionDisconnectAction`.
    await screen.findByText('financeAccountsBankConnectionDisconnectConfirm');
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('disconnects and refreshes the list when the dialog is confirmed', async () => {
    mockDisconnect.mockResolvedValue(undefined);
    await requestDisconnect();

    fireEvent.click(await screen.findByText('financeAccountsBankConnectionDisconnectAction'));

    // The kebab's "Desconectar" is the SOFT path: it deactivates but keeps the link.
    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith('acc-1', { permanentDeletion: false }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionDisconnectDone'));
    expect(onDataMutated).toHaveBeenCalled();
  });

  it('deletes the connection permanently after accepting the warning cartel', async () => {
    mockDisconnect.mockResolvedValue({ disconnected: true, permanent: true, reconnectable: false });
    renderTable();
    openRowMenu('acc-1');
    fireEvent.click(await screen.findByTestId('account-row-menu-delete-connection-acc-1'));

    // The irreversible path is gated by the warning cartel, not the plain confirm dialog.
    await screen.findByTestId('bank-connection-delete-confirm-modal');
    expect(mockDisconnect).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByTestId('bank-connection-delete-confirm-accept'));

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith('acc-1', { permanentDeletion: true }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionDeleteDone'));
    expect(onDataMutated).toHaveBeenCalled();
  });

  it('shows an error toast when the disconnect throws', async () => {
    mockDisconnect.mockRejectedValue(new Error('fail'));
    await requestDisconnect();

    fireEvent.click(await screen.findByText('financeAccountsBankConnectionDisconnectAction'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('fail'));
  });
});

describe('AccountsHeaderTable — edit modal', () => {
  it('opens the edit modal from the row edit button', async () => {
    renderTable();

    fireEvent.click(screen.getByTestId('account-row-edit-acc-1'));

    await waitFor(() => expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'true'));
    expect(editModalProps.account).toEqual(CONNECTED);
  });

  it('closes the edit modal and opens the archive dialog from its onArchive', async () => {
    renderTable();
    fireEvent.click(screen.getByTestId('account-row-edit-acc-1'));
    await waitFor(() => expect(editModalProps.account).toEqual(CONNECTED));

    editModalProps.onArchive(CONNECTED);

    await waitFor(() => expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'true'));
    expect(archiveDialogProps.account).toEqual(CONNECTED);
    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
  });

  it('closes the edit modal and starts the connect flow from its onConnect', async () => {
    renderTable();
    fireEvent.click(screen.getByTestId('account-row-edit-acc-1'));
    await waitFor(() => expect(editModalProps.account).toEqual(CONNECTED));

    editModalProps.onConnect(CONNECTED);

    await waitFor(() => expect(mockStartConnect).toHaveBeenCalledWith(CONNECTED));
    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
  });

  // ETP-4871 — same "close the edit modal, open the sibling dialog" shape as onArchive above.
  it('closes the edit modal and opens the delete dialog from its onDelete', async () => {
    renderTable([DELETABLE, OFFLINE]);
    fireEvent.click(screen.getByTestId('account-row-edit-acc-3'));
    await waitFor(() => expect(editModalProps.account).toEqual(DELETABLE));

    editModalProps.onDelete(DELETABLE);

    await waitFor(() => expect(screen.getByTestId('delete-dialog')).toHaveAttribute('data-open', 'true'));
    expect(deleteDialogProps.account).toEqual(DELETABLE);
    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
  });

  it('refreshes the list after a save', () => {
    renderTable();

    editModalProps.onSaved();

    expect(onDataMutated).toHaveBeenCalled();
  });
});

describe('AccountsHeaderTable — archive & transfer', () => {
  it('opens the archive dialog directly from the row kebab', async () => {
    renderTable();
    openRowMenu('acc-1');

    fireEvent.click(await screen.findByTestId('account-row-menu-archive-acc-1'));

    await waitFor(() => expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'true'));
  });

  it('refreshes the list after an archive', () => {
    renderTable();

    archiveDialogProps.onArchived();

    expect(onDataMutated).toHaveBeenCalled();
  });

  it('renders the transfer modal only once a transfer source is set', async () => {
    renderTable();
    expect(screen.queryByTestId('transfer-modal')).not.toBeInTheDocument();

    openRowMenu('acc-1');
    fireEvent.click(await screen.findByTestId('account-row-menu-transfer-acc-1'));

    await waitFor(() => expect(screen.getByTestId('transfer-modal')).toHaveAttribute('data-source', 'acc-1'));
  });
});

// ETP-4871 — the row kebab's "Eliminar cuenta" only appears once `deletable === true`.
describe('AccountsHeaderTable — delete', () => {
  it('opens the delete dialog directly from the row kebab when the row is deletable', async () => {
    renderTable([DELETABLE, OFFLINE]);
    openRowMenu('acc-3');

    fireEvent.click(await screen.findByTestId('account-row-menu-delete-acc-3'));

    await waitFor(() => expect(screen.getByTestId('delete-dialog')).toHaveAttribute('data-open', 'true'));
    expect(deleteDialogProps.account).toEqual(DELETABLE);
  });

  // ETP-5111 — the item is offered on every row now, and opening the dialog for a NON-deletable
  // account is the point: that is where the backend's refusal gets explained. Before, the action
  // simply did not exist on such a row, which is indistinguishable from a bug to the user.
  it('offers the delete menu item for a non-deletable row and opens the dialog for it', async () => {
    renderTable();
    openRowMenu('acc-1');

    fireEvent.click(await screen.findByTestId('account-row-menu-delete-acc-1'));

    await waitFor(() => expect(screen.getByTestId('delete-dialog')).toHaveAttribute('data-open', 'true'));
    expect(deleteDialogProps.account).toMatchObject({ id: 'acc-1' });
  });

  it('refreshes the list after a delete', () => {
    renderTable();

    deleteDialogProps.onDeleted();

    expect(onDataMutated).toHaveBeenCalled();
  });
});

describe('AccountsHeaderTable — new account wizard', () => {
  it('opens from the toolbar and refreshes the list on create', () => {
    renderTable();
    expect(screen.getByTestId('wizard')).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByTestId('toolbar-new-account'));

    expect(screen.getByTestId('wizard')).toHaveAttribute('data-open', 'true');
    wizardProps.onCreated();
    expect(onDataMutated).toHaveBeenCalled();
  });
});

describe('AccountsHeaderTable — refresh without a host callback', () => {
  it('does not throw when onDataMutated is not provided', async () => {
    mockSync.mockResolvedValue({ status: 'OK' });
    render(<AccountsHeaderTable data={[CONNECTED]} meta={null} />);

    fireEvent.click(screen.getByTestId('account-row-refresh-acc-1'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });
});
