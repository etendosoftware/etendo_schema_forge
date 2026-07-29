import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// This suite mocks the table + modals so the page's handler callbacks
// (handleBankConnectionAction, handleReconcile, edit/archive/transfer openers) can be
// invoked directly — they are otherwise unreachable through the real table UI.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const mockSetPageMeta = vi.fn();
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (...args) => mockSetPageMeta(...args),
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

const mockReload = vi.fn();
const mockUseFinancialAccounts = vi.fn(() => ({
  accounts: [], summary: {}, loading: false, error: null, reload: mockReload,
}));
vi.mock('@/hooks/useFinancialAccounts.js', () => ({
  useFinancialAccounts: () => mockUseFinancialAccounts(),
}));

const mockSync = vi.fn();
const mockDisconnect = vi.fn();
vi.mock('@/hooks/useBankConnectionActions.js', () => ({
  useBankConnectionActions: () => ({ sync: mockSync, disconnect: mockDisconnect }),
  launchSaltEdgePopup: vi.fn(),
}));

const mockStartConnect = vi.fn();
const mockStartCreate = vi.fn();
vi.mock('@/hooks/useBankConnectionFlow.js', () => ({
  useBankConnectionFlow: () => ({ startConnect: mockStartConnect, startCreate: mockStartCreate }),
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
vi.mock('@/windows/custom/financial-account/BankConnectionFlowUI.jsx', () => ({
  BankConnectionFlowUI: () => <div data-testid="bank-connection-flow" />,
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

describe('FinancialAccountsPage — bank connection connect action', () => {
  it('starts the connect flow', () => {
    renderPage([ACC]);
    tableProps.onBankConnectionAction('connect', ACC);
    expect(mockStartConnect).toHaveBeenCalledWith(ACC);
  });
});

describe('FinancialAccountsPage — bank connection sync action', () => {
  it('shows a success toast on OK sync and reloads', async () => {
    mockSync.mockResolvedValue({ status: 'OK', message: 'done' });
    renderPage([ACC]);
    await tableProps.onBankConnectionAction('syncNow', ACC);
    expect(mockSync).toHaveBeenCalledWith('acc-1');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('done'));
    expect(mockReload).toHaveBeenCalled();
  });

  it('shows an info toast on WARNING sync', async () => {
    mockSync.mockResolvedValue({ status: 'WARNING', message: 'partial' });
    renderPage([ACC]);
    await tableProps.onBankConnectionAction('syncNow', ACC);
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('partial'));
  });

  it('shows an error toast on ERROR status', async () => {
    mockSync.mockResolvedValue({ status: 'ERROR', message: 'boom' });
    renderPage([ACC]);
    await tableProps.onBankConnectionAction('syncNow', ACC);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('boom'));
  });

  it('falls back to a generic label when sync returns no message', async () => {
    mockSync.mockResolvedValue({ status: 'OK' });
    renderPage([ACC]);
    await tableProps.onBankConnectionAction('syncNow', ACC);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionSyncDone'));
  });

  it('shows an error toast when sync throws', async () => {
    mockSync.mockRejectedValue(new Error('network'));
    renderPage([ACC]);
    await tableProps.onBankConnectionAction('syncNow', ACC);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('network'));
  });
});

describe('FinancialAccountsPage — bank connection disconnect action', () => {
  it('opens a styled confirm dialog and does not disconnect until confirmed', async () => {
    renderPage([ACC]);
    await tableProps.onBankConnectionAction('disconnect', ACC);
    // The action only opens the confirm dialog; nothing is disconnected yet.
    await screen.findByText('financeAccountsBankConnectionDisconnectAction');
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('disconnects and reloads when the dialog is confirmed', async () => {
    mockDisconnect.mockResolvedValue(undefined);
    renderPage([ACC]);
    await tableProps.onBankConnectionAction('disconnect', ACC);
    fireEvent.click(await screen.findByText('financeAccountsBankConnectionDisconnectAction'));
    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith('acc-1'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionDisconnectDone'));
    expect(mockReload).toHaveBeenCalled();
  });

  it('shows an error toast when disconnect throws', async () => {
    mockDisconnect.mockRejectedValue(new Error('fail'));
    renderPage([ACC]);
    await tableProps.onBankConnectionAction('disconnect', ACC);
    fireEvent.click(await screen.findByText('financeAccountsBankConnectionDisconnectAction'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('fail'));
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
});

describe('FinancialAccountsPage — archive & transfer', () => {
  it('opens the archive dialog directly from the table', async () => {
    renderPage([ACC]);
    tableProps.onArchive(ACC);
    await waitFor(() => {
      expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'true');
    });
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
