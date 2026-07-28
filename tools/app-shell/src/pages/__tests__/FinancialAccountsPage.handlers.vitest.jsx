import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// This suite mocks the table + modals so the page's handler callbacks
// (handlePsd2Action, handleReconcile, edit/archive/transfer openers) can be
// invoked directly — they are otherwise unreachable through the real table UI.

vi.mock('@/i18n', () => ({
  // Params are appended (not dropped) so bulk-delete assertions below can
  // verify the exact count passed through (e.g. `bulkDeleteConfirmMessage:{"count":2}`).
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const mockSetPageMeta = vi.fn();
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (...args) => mockSetPageMeta(...args),
}));

const toastError = vi.fn();
const toastInfo = vi.fn();
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...a) => toastError(...a),
    info: (...a) => toastInfo(...a),
    success: (...a) => toastSuccess(...a),
    warning: (...a) => toastWarning(...a),
  },
}));

const mockReload = vi.fn();
const mockUseFinancialAccounts = vi.fn(() => ({
  accounts: [], summary: {}, loading: false, error: null, reload: mockReload,
}));
vi.mock('@/hooks/useFinancialAccounts.js', () => ({
  useFinancialAccounts: () => mockUseFinancialAccounts(),
}));

// ETP-4656 — the page now also calls useAccountMutations() (bulk "Delete selected"
// reuses archiveAccount()), which calls useAuth() internally; stub it at the module
// level like every other auth-touching hook in this suite (no AuthProvider needed).
// `mockArchiveAccount` is hoisted to module scope (not re-created per render) so
// bulk-delete tests below can configure per-item resolve/reject behavior and
// still assert on the exact ids it was called with.
const mockArchiveAccount = vi.fn();
vi.mock('@/hooks/useAccountMutations.js', () => ({
  useAccountMutations: () => ({
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    archiveAccount: (...args) => mockArchiveAccount(...args),
    fetchDefaults: vi.fn().mockResolvedValue({ currencies: [], defaultCurrencyId: '' }),
  }),
}));

const mockSync = vi.fn();
const mockDisconnect = vi.fn();
vi.mock('@/hooks/usePsd2Actions.js', () => ({
  usePsd2Actions: () => ({ sync: mockSync, disconnect: mockDisconnect }),
  launchSaltEdgePopup: vi.fn(),
}));

const mockStartConnect = vi.fn();
const mockStartCreate = vi.fn();
vi.mock('@/hooks/usePsd2ConnectFlow.js', () => ({
  usePsd2ConnectFlow: () => ({ startConnect: mockStartConnect, startCreate: mockStartCreate }),
}));

// Capture the props the page hands to the table so we can drive its callbacks.
let tableProps = null;
vi.mock('@/components/financial-accounts', async () => {
  const actual = await vi.importActual('@/components/financial-accounts');
  return {
    // AccountTypeFilter is a real enum consumed by filterAccounts — keep it.
    AccountTypeFilter: actual.AccountTypeFilter,
    AccountsSidebar: () => <div data-testid="sidebar" />,
    AccountsToolbar: () => <div data-testid="toolbar" />,
    AccountsTable: (props) => {
      tableProps = props;
      return <div data-testid="table" />;
    },
    // ETP-4656 — the real BulkDeleteSelectionBar is a thin presentational
    // component (count/onDelete/onCancel/deleting), kept real (not stubbed)
    // so the tests below can drive it exactly as a user would.
    BulkDeleteSelectionBar: actual.BulkDeleteSelectionBar,
  };
});

vi.mock('@/windows/custom/financial-account/NewAccountWizard.jsx', () => ({
  NewAccountWizard: () => <div data-testid="wizard" />,
}));
let editModalProps = null;
vi.mock('@/windows/custom/financial-account/EditAccountModal.jsx', () => ({
  EditAccountModal: (props) => { editModalProps = props; return <div data-testid="edit-modal" data-open={String(props.open)} />; },
}));
let archiveDialogProps = null;
vi.mock('@/windows/custom/financial-account/ArchiveAccountDialog.jsx', () => ({
  ArchiveAccountDialog: (props) => { archiveDialogProps = props; return <div data-testid="archive-dialog" data-open={String(props.open)} />; },
}));
vi.mock('@/windows/custom/financial-account/Psd2ConnectFlowUI.jsx', () => ({
  Psd2ConnectFlowUI: () => <div data-testid="psd2-flow" />,
}));
vi.mock('@/windows/custom/financial-account/FundsTransferModal.jsx', () => ({
  FundsTransferModal: (props) => <div data-testid="transfer-modal" data-source={props.sourceAccountId} />,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import FinancialAccountsPage from '../FinancialAccountsPage.jsx';

function renderPage(accounts = []) {
  mockUseFinancialAccounts.mockReturnValue({
    accounts, summary: {}, loading: false, error: null, reload: mockReload,
  });
  return render(
    <MemoryRouter>
      <FinancialAccountsPage />
    </MemoryRouter>,
  );
}

const ACC = { id: 'acc-1', name: 'BBVA', type: 'B', active: true };
const ACC2 = { id: 'acc-2', name: 'Caja Tienda', type: 'C', active: true };

beforeEach(() => {
  vi.clearAllMocks();
  tableProps = null;
  editModalProps = null;
  archiveDialogProps = null;
});

describe('FinancialAccountsPage — reconcile navigation', () => {
  it('navigates to the reconciliation route with autoMatch', () => {
    renderPage([ACC]);
    tableProps.onReconcile(ACC);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/financial-account/acc-1?tab=reconciliation&autoMatch=true',
    );
  });
});

describe('FinancialAccountsPage — PSD2 connect action', () => {
  it('starts the connect flow', () => {
    renderPage([ACC]);
    tableProps.onPsd2Action('connect', ACC);
    expect(mockStartConnect).toHaveBeenCalledWith(ACC);
  });
});

describe('FinancialAccountsPage — PSD2 sync action', () => {
  it('shows a success toast on OK sync and reloads', async () => {
    mockSync.mockResolvedValue({ status: 'OK', message: 'done' });
    renderPage([ACC]);
    await tableProps.onPsd2Action('syncNow', ACC);
    expect(mockSync).toHaveBeenCalledWith('acc-1');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('done'));
    expect(mockReload).toHaveBeenCalled();
  });

  it('shows an info toast on WARNING sync', async () => {
    mockSync.mockResolvedValue({ status: 'WARNING', message: 'partial' });
    renderPage([ACC]);
    await tableProps.onPsd2Action('syncNow', ACC);
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('partial'));
  });

  it('shows an error toast on ERROR status', async () => {
    mockSync.mockResolvedValue({ status: 'ERROR', message: 'boom' });
    renderPage([ACC]);
    await tableProps.onPsd2Action('syncNow', ACC);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('boom'));
  });

  it('falls back to a generic label when sync returns no message', async () => {
    mockSync.mockResolvedValue({ status: 'OK' });
    renderPage([ACC]);
    await tableProps.onPsd2Action('syncNow', ACC);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsPsd2SyncDone'));
  });

  it('shows an error toast when sync throws', async () => {
    mockSync.mockRejectedValue(new Error('network'));
    renderPage([ACC]);
    await tableProps.onPsd2Action('syncNow', ACC);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('network'));
  });
});

describe('FinancialAccountsPage — PSD2 disconnect action', () => {
  it('opens a styled confirm dialog and does not disconnect until confirmed', async () => {
    renderPage([ACC]);
    await tableProps.onPsd2Action('disconnect', ACC);
    // The action only opens the confirm dialog; nothing is disconnected yet.
    await screen.findByText('financeAccountsPsd2DisconnectAction');
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('disconnects and reloads when the dialog is confirmed', async () => {
    mockDisconnect.mockResolvedValue(undefined);
    renderPage([ACC]);
    await tableProps.onPsd2Action('disconnect', ACC);
    fireEvent.click(await screen.findByText('financeAccountsPsd2DisconnectAction'));
    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith('acc-1'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsPsd2DisconnectDone'));
    expect(mockReload).toHaveBeenCalled();
  });

  it('shows an error toast when disconnect throws', async () => {
    mockDisconnect.mockRejectedValue(new Error('fail'));
    renderPage([ACC]);
    await tableProps.onPsd2Action('disconnect', ACC);
    fireEvent.click(await screen.findByText('financeAccountsPsd2DisconnectAction'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('fail'));
  });

  it('cancel dismisses the confirm dialog without disconnecting', async () => {
    renderPage([ACC]);
    await tableProps.onPsd2Action('disconnect', ACC);
    await screen.findByText('financeAccountsPsd2DisconnectAction');
    fireEvent.click(screen.getByText('cancel'));
    await waitFor(() => expect(screen.queryByText('financeAccountsPsd2DisconnectAction')).not.toBeInTheDocument());
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});

describe('FinancialAccountsPage — edit modal', () => {
  it('opens the edit modal when a row edit is requested', async () => {
    renderPage([ACC]);
    tableProps.onEdit(ACC);
    await waitFor(() => {
      expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'true');
    });
    expect(editModalProps.account).toEqual(ACC);
  });

  it('edit modal onArchive closes edit and opens the archive dialog', async () => {
    renderPage([ACC]);
    tableProps.onEdit(ACC);
    await waitFor(() => expect(editModalProps.account).toEqual(ACC));
    editModalProps.onArchive(ACC);
    await waitFor(() => {
      expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'true');
    });
    expect(archiveDialogProps.account).toEqual(ACC);
  });

  it('edit modal onConnect closes edit and starts the connect flow', async () => {
    renderPage([ACC]);
    tableProps.onEdit(ACC);
    await waitFor(() => expect(editModalProps.account).toEqual(ACC));
    editModalProps.onConnect(ACC);
    await waitFor(() => expect(mockStartConnect).toHaveBeenCalledWith(ACC));
  });

  it('edit modal onClose clears the edit target', async () => {
    renderPage([ACC]);
    tableProps.onEdit(ACC);
    await waitFor(() => expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'true'));
    editModalProps.onClose();
    await waitFor(() => expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false'));
  });
});

describe('FinancialAccountsPage — archive & transfer', () => {
  it('opens the archive dialog directly from the table', async () => {
    renderPage([ACC]);
    tableProps.onArchive(ACC);
    await waitFor(() => {
      expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'true');
    });
  });

  it('archive dialog onClose clears the archive target', async () => {
    renderPage([ACC]);
    tableProps.onArchive(ACC);
    await waitFor(() => expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'true'));
    archiveDialogProps.onClose();
    await waitFor(() => expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'false'));
  });

  it('renders the transfer modal only after a transfer source is set', async () => {
    renderPage([ACC]);
    expect(screen.queryByTestId('transfer-modal')).not.toBeInTheDocument();
    tableProps.onTransfer(ACC);
    await waitFor(() => {
      expect(screen.getByTestId('transfer-modal')).toHaveAttribute('data-source', 'acc-1');
    });
  });

  it('onRetry is wired to reload', () => {
    renderPage([ACC]);
    tableProps.onRetry();
    expect(mockReload).toHaveBeenCalled();
  });
});

// ETP-4656 — bulk-delete wiring: handleSelectionChange (toggle Set<id>),
// clearSelection, the conditional toolbar/BulkDeleteSelectionBar swap, and
// requestBatchDelete's onOutcome branches (all-succeeded / partial-failure).
describe('FinancialAccountsPage — bulk delete selection', () => {
  it('shows the toolbar by default and swaps to the selection bar once a row is selected', () => {
    renderPage([ACC, ACC2]);

    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(screen.queryByTestId('bulk-delete-selection-bar')).not.toBeInTheDocument();

    act(() => tableProps.onSelectionChange('acc-1'));

    expect(screen.queryByTestId('toolbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('bulk-delete-selection-bar')).toBeInTheDocument();
    expect(tableProps.selectedIds.has('acc-1')).toBe(true);
  });

  it('toggling the same account id a second time clears the selection (Set delete branch)', () => {
    renderPage([ACC, ACC2]);

    act(() => tableProps.onSelectionChange('acc-1'));
    expect(tableProps.selectedIds.has('acc-1')).toBe(true);

    act(() => tableProps.onSelectionChange('acc-1'));

    expect(tableProps.selectedIds.has('acc-1')).toBe(false);
    expect(screen.queryByTestId('bulk-delete-selection-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
  });

  it('selecting two rows keeps both independently selected', () => {
    renderPage([ACC, ACC2]);

    act(() => tableProps.onSelectionChange('acc-1'));
    act(() => tableProps.onSelectionChange('acc-2'));

    expect(tableProps.selectedIds.has('acc-1')).toBe(true);
    expect(tableProps.selectedIds.has('acc-2')).toBe(true);
    // The bar's count is only interpolated via the literal `({count})` next to
    // the trigger label — `ui('selected', {count})` is a separate translated
    // status span whose mock here just returns `selected:{"count":2}`.
    expect(screen.getByTestId('bulk-delete-selection-trigger')).toHaveTextContent('(2)');
  });

  it('Cancel on the selection bar clears the selection and restores the toolbar', () => {
    renderPage([ACC, ACC2]);

    act(() => tableProps.onSelectionChange('acc-1'));
    expect(screen.getByTestId('bulk-delete-selection-bar')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bulk-delete-selection-cancel'));

    expect(screen.queryByTestId('bulk-delete-selection-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(tableProps.selectedIds.size).toBe(0);
  });

  it('clicking Delete on the selection bar opens the confirm dialog scoped to only the selected accounts', () => {
    renderPage([ACC, ACC2]);

    act(() => tableProps.onSelectionChange('acc-1'));
    fireEvent.click(screen.getByTestId('bulk-delete-selection-trigger'));

    // Dialog (Radix DialogPrimitive.Root) is a context provider, not a DOM
    // node — DialogDescription (Radix's <p>) is the first real DOM element
    // that actually renders once `open` is true.
    expect(screen.getByTestId('DialogDescription__batch-delete')).toHaveTextContent(
      'bulkDeleteConfirmMessage:{"count":1}',
    );
    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();
  });

  it('all-succeeded outcome: reloads and clears the selection back to the toolbar', async () => {
    mockArchiveAccount.mockResolvedValue(undefined);
    renderPage([ACC, ACC2]);

    act(() => tableProps.onSelectionChange('acc-1'));
    act(() => tableProps.onSelectionChange('acc-2'));
    fireEvent.click(screen.getByTestId('bulk-delete-selection-trigger'));
    fireEvent.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(mockReload).toHaveBeenCalled());
    expect(mockArchiveAccount).toHaveBeenCalledWith('acc-1');
    expect(mockArchiveAccount).toHaveBeenCalledWith('acc-2');

    await waitFor(() => {
      expect(screen.queryByTestId('bulk-delete-selection-bar')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(tableProps.selectedIds.size).toBe(0);
  });

  it('partial-failure outcome: reloads (since at least one succeeded) and keeps only the failed account selected', async () => {
    mockArchiveAccount.mockImplementation((id) =>
      id === 'acc-2' ? Promise.reject(new Error('locked')) : Promise.resolve(undefined),
    );
    renderPage([ACC, ACC2]);

    act(() => tableProps.onSelectionChange('acc-1'));
    act(() => tableProps.onSelectionChange('acc-2'));
    fireEvent.click(screen.getByTestId('bulk-delete-selection-trigger'));
    fireEvent.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(mockReload).toHaveBeenCalled());

    // Selection is narrowed down to just the failed account — the bar stays
    // visible (selectedIds is non-empty) but now scoped to 'acc-2' only.
    await waitFor(() => {
      expect(screen.getByTestId('bulk-delete-selection-trigger')).toHaveTextContent('(1)');
    });
    expect(tableProps.selectedIds.has('acc-2')).toBe(true);
    expect(tableProps.selectedIds.has('acc-1')).toBe(false);
  });

  it('all-failed outcome: does not reload and leaves the selection untouched', async () => {
    mockArchiveAccount.mockRejectedValue(new Error('locked'));
    renderPage([ACC, ACC2]);

    act(() => tableProps.onSelectionChange('acc-1'));
    fireEvent.click(screen.getByTestId('bulk-delete-selection-trigger'));
    fireEvent.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());

    expect(mockReload).not.toHaveBeenCalled();
    expect(screen.getByTestId('bulk-delete-selection-bar')).toBeInTheDocument();
    expect(tableProps.selectedIds.has('acc-1')).toBe(true);
  });
});
