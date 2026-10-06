/**
 * AccountsHeaderTable — read-only access tier, defense in depth (ETP-5457).
 *
 * The sibling suites cover what the user SEES under the read-only tier (no "Nueva cuenta", no
 * row edit / sync icons, a kebab reduced to "Abrir cuenta", no checkboxes). This one covers the
 * second line the slot draws behind that: a mutating handler that is reached anyway is a no-op
 * (`guardWrite`, the early returns in `handleBankConnectionAction` / `runDisconnect`), and every
 * write dialog is kept shut under the tier whatever its own state says.
 *
 * To reach the handlers without their (hidden) triggers, every child that receives one is
 * stubbed to CAPTURE its props: the toolbar (`onNewAccount`), AccountRowActions (the row
 * handlers), the edit modal (`onConnect`) and the disconnect ConfirmDialog (`onConfirm`). The
 * tier is configurable per test, keyed by AD_Window_ID, and can be flipped between renders to
 * prove a dialog opened under full access is forced closed once the tier turns read-only.
 *
 * Every read-only case is paired with a full-access twin that proves the same call DOES write,
 * so a guard that silently stopped existing cannot pass unnoticed.
 */
import { render, screen, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const FINANCIAL_ACCOUNT_WINDOW_ID = '94EAA455D2644E04AB25D93BE5157B6D';
const MATCH_RULE_WINDOW_ID = '24963D64E83B4543A7F6BD248CF944EE';
// Keyed by AD_Window_ID. A window id the test never configured resolves to 'full' (so a test
// only states the tiers it cares about). A CONFIGURED value mirrors the real hook
// (app-shell-core `useWindowAccess`), which fails closed: anything that is not one of
// none / read-only / full — `undefined` included, i.e. an unloaded access map — resolves 'none'.
const VALID_ACCESS_TIERS = new Set(['none', 'read-only', 'full']);
const mockWindowAccess = { tiers: {} };
vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: (windowId) => {
    if (!Object.prototype.hasOwnProperty.call(mockWindowAccess.tiers, windowId)) return 'full';
    const tier = mockWindowAccess.tiers[windowId];
    return VALID_ACCESS_TIERS.has(tier) ? tier : 'none';
  },
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
const mockReconnect = vi.fn();
const mockFinishReconnect = vi.fn();
const mockLaunchPopup = vi.fn();
vi.mock('@/hooks/useBankConnectionActions.js', () => ({
  useBankConnectionActions: () => ({
    sync: mockSync,
    disconnect: mockDisconnect,
    reconnect: mockReconnect,
    finishReconnect: mockFinishReconnect,
  }),
  launchSaltEdgePopup: (...a) => mockLaunchPopup(...a),
}));

const mockStartConnect = vi.fn();
const mockStartCreate = vi.fn();
vi.mock('@/hooks/useBankConnectionFlow.js', () => ({
  useBankConnectionFlow: () => ({ startConnect: mockStartConnect, startCreate: mockStartCreate }),
}));

let toolbarProps = null;
vi.mock('@/components/financial-accounts', async () => {
  const actual = await vi.importActual('@/components/financial-accounts');
  return {
    AccountTypeFilter: actual.AccountTypeFilter,
    AccountsSidebar: () => <div data-testid="sidebar" />,
    AccountsToolbar: (props) => {
      toolbarProps = props;
      return <div data-testid="toolbar-stub" />;
    },
  };
});

// Captured per row id: the handlers the slot hands to each row's actions.
let rowActionsProps = {};
vi.mock('@/components/financial-accounts/AccountRowActions.jsx', () => ({
  AccountRowActions: (props) => {
    rowActionsProps[props.account.id] = props;
    return <span data-testid={`row-actions-stub-${props.account.id}`} />;
  },
}));

vi.mock('@/windows/custom/financial-account/NewAccountWizard.jsx', () => ({
  NewAccountWizard: (props) => <div data-testid="wizard" data-open={String(props.open)} />,
}));
let editModalProps = null;
vi.mock('@/windows/custom/financial-account/EditAccountModal.jsx', () => ({
  EditAccountModal: (props) => {
    editModalProps = props;
    return <div data-testid="edit-modal" data-open={String(props.open)} />;
  },
}));
vi.mock('@/windows/custom/financial-account/ArchiveAccountDialog.jsx', () => ({
  ArchiveAccountDialog: (props) => <div data-testid="archive-dialog" data-open={String(props.open)} />,
}));
vi.mock('@/windows/custom/financial-account/DeleteAccountDialog.jsx', () => ({
  DeleteAccountDialog: (props) => <div data-testid="delete-dialog" data-open={String(props.open)} />,
}));
vi.mock('@/windows/custom/financial-account/BankConnectionFlowUI.jsx', () => ({
  BankConnectionFlowUI: () => <div data-testid="bank-connection-flow" />,
}));
vi.mock('@/windows/custom/financial-account/FundsTransferModal.jsx', () => ({
  FundsTransferModal: (props) => <div data-testid="transfer-modal" data-source={props.sourceAccountId} />,
}));
vi.mock('@/windows/custom/financial-account/BankConnectionDeleteConfirmModal.jsx', () => ({
  default: () => <div data-testid="delete-connection-modal" />,
}));
let confirmDialogProps = null;
vi.mock('@/components/OAuth2ClientDialog', () => ({
  ConfirmDialog: (props) => {
    confirmDialogProps = props;
    return <div data-testid="disconnect-confirm" data-open={String(props.open)} />;
  },
}));

let tableProps = null;
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => {
    tableProps = props;
    const { data, rowQuickActions } = props;
    return (
      <div data-testid="data-table">
        {(data ?? []).map((row) => (
          <div key={row.id} data-testid={`row-${row.id}`}>{rowQuickActions?.render?.(row)}</div>
        ))}
      </div>
    );
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

import AccountsHeaderTable from '@generated/financial-account/custom/AccountsHeaderTable.jsx';

const CONNECTED = {
  id: 'acc-1', name: 'BBVA', type: 'B', currentBalance: 0, countryIso: 'ES',
  currencyIso: 'EUR', eTGOPendingCount: 2, bankConnected: true, active: true,
};
const DATA = [CONNECTED];

const onDataMutated = vi.fn();

function setTier(fa, mr = 'full') {
  mockWindowAccess.tiers = { [FINANCIAL_ACCOUNT_WINDOW_ID]: fa, [MATCH_RULE_WINDOW_ID]: mr };
}

function renderTable() {
  return render(<AccountsHeaderTable data={DATA} meta={{ summary: null }} onDataMutated={onDataMutated} />);
}

function rerenderTable(rerender) {
  rerender(<AccountsHeaderTable data={DATA} meta={{ summary: null }} onDataMutated={onDataMutated} />);
}

/** The handlers the slot handed to acc-1's row actions on the LATEST render. */
const row = () => rowActionsProps['acc-1'];

/** Runs a captured handler inside act and lets any awaited promise settle. */
async function call(fn, ...args) {
  await act(async () => { await fn(...args); });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWindowAccess.tiers = {};
  toolbarProps = null;
  rowActionsProps = {};
  editModalProps = null;
  confirmDialogProps = null;
  tableProps = null;
});

describe('AccountsHeaderTable — tier forwarded to the children (ETP-5457)', () => {
  it('tells the toolbar and the row actions the window is read-only (ETP-5457)', () => {
    setTier('read-only');
    renderTable();

    expect(toolbarProps.windowReadOnly).toBe(true);
    expect(row().windowReadOnly).toBe(true);
  });

  it('tells the toolbar and the row actions the window is writable under full access (ETP-5457 twin)', () => {
    setTier('full');
    renderTable();

    expect(toolbarProps.windowReadOnly).toBe(false);
    expect(row().windowReadOnly).toBe(false);
  });

  it('feeds showMatchingRules from the match-rule tier, not from this window\'s (ETP-5457)', () => {
    setTier('read-only', 'none');
    const { unmount } = renderTable();
    expect(toolbarProps.showMatchingRules).toBe(false);
    unmount();

    setTier('read-only', 'read-only');
    renderTable();
    expect(toolbarProps.showMatchingRules).toBe(true);
  });

  it('feeds showMatchingRules the same way under full access (ETP-5457 twin)', () => {
    setTier('full', 'none');
    const { unmount } = renderTable();
    expect(toolbarProps.showMatchingRules).toBe(false);
    unmount();

    setTier('full', 'full');
    renderTable();
    expect(toolbarProps.showMatchingRules).toBe(true);
  });

  // useWindowAccess fails CLOSED: an unloaded access map (`undefined`) or an unrecognised value
  // resolves 'none', so the slot must NOT offer a link into a window whose access is unknown.
  it.each([
    ['undefined (access map not loaded)', undefined],
    ['an unrecognised value', 'admin'],
  ])('hides "Reglas de matcheo" when the match-rule tier is %s (ETP-5457)', (_label, mr) => {
    mockWindowAccess.tiers = { [FINANCIAL_ACCOUNT_WINDOW_ID]: 'read-only', [MATCH_RULE_WINDOW_ID]: mr };
    renderTable();

    expect(toolbarProps.showMatchingRules).toBe(false);
  });

  it('offers "Reglas de matcheo" when the match-rule tier is a known non-none value (ETP-5457 twin)', () => {
    mockWindowAccess.tiers = { [FINANCIAL_ACCOUNT_WINDOW_ID]: 'read-only', [MATCH_RULE_WINDOW_ID]: 'read-only' };
    renderTable();

    expect(toolbarProps.showMatchingRules).toBe(true);
  });
});

describe('AccountsHeaderTable — guarded write handlers (ETP-5457)', () => {
  it('ignores the toolbar onNewAccount under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(toolbarProps.onNewAccount);

    expect(screen.getByTestId('wizard')).toHaveAttribute('data-open', 'false');
  });

  it('opens the wizard from the toolbar onNewAccount under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(toolbarProps.onNewAccount);

    expect(screen.getByTestId('wizard')).toHaveAttribute('data-open', 'true');
  });

  it('ignores onEdit under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(row().onEdit, CONNECTED);

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
    expect(editModalProps.account).toBeNull();
  });

  it('opens the edit modal from onEdit under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(row().onEdit, CONNECTED);

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'true');
    expect(editModalProps.account).toEqual(CONNECTED);
  });

  it('ignores onArchive under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(row().onArchive, CONNECTED);

    expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'false');
  });

  it('opens the archive dialog from onArchive under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(row().onArchive, CONNECTED);

    expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'true');
  });

  it('ignores onDelete under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(row().onDelete, CONNECTED);

    expect(screen.getByTestId('delete-dialog')).toHaveAttribute('data-open', 'false');
  });

  it('opens the delete dialog from onDelete under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(row().onDelete, CONNECTED);

    expect(screen.getByTestId('delete-dialog')).toHaveAttribute('data-open', 'true');
  });

  it('ignores onTransfer under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(row().onTransfer, CONNECTED);

    expect(screen.queryByTestId('transfer-modal')).not.toBeInTheDocument();
  });

  it('mounts the transfer modal from onTransfer under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(row().onTransfer, CONNECTED);

    expect(screen.getByTestId('transfer-modal')).toHaveAttribute('data-source', 'acc-1');
  });

  it('ignores onNewMovement under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(row().onNewMovement, CONNECTED);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('deep-links to a new movement from onNewMovement under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(row().onNewMovement, CONNECTED);

    expect(mockNavigate).toHaveBeenCalledWith('/financial-account/acc-1?tab=movements&newMovement=true');
  });

  // Navigation is deliberately NOT guarded: it only leads to the detail, which applies the tier.
  it('still navigates through onOpen and the row click under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(row().onOpen, CONNECTED);
    await call(tableProps.onNavigate, CONNECTED);

    expect(mockNavigate).toHaveBeenNthCalledWith(1, '/financial-account/acc-1');
    expect(mockNavigate).toHaveBeenNthCalledWith(2, '/financial-account/acc-1');
  });

  it('navigates through onOpen and the row click under full access too (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(row().onOpen, CONNECTED);
    await call(tableProps.onNavigate, CONNECTED);

    expect(mockNavigate).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenCalledWith('/financial-account/acc-1');
  });
});

describe('AccountsHeaderTable — guarded bank-connection actions (ETP-5457)', () => {
  it('ignores connect under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(row().onBankConnectionAction, 'connect', CONNECTED);

    expect(mockStartConnect).not.toHaveBeenCalled();
  });

  it('starts the connect flow under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(row().onBankConnectionAction, 'connect', CONNECTED);

    expect(mockStartConnect).toHaveBeenCalledWith(CONNECTED);
  });

  it('ignores syncNow under the read-only tier — no request, no toast, no reload (ETP-5457)', async () => {
    setTier('read-only');
    mockSync.mockResolvedValue({ status: 'OK', message: 'done' });
    renderTable();

    await call(row().onBankConnectionAction, 'syncNow', CONNECTED);

    expect(mockSync).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onDataMutated).not.toHaveBeenCalled();
  });

  it('syncs, toasts and reloads under full access (ETP-5457 twin)', async () => {
    setTier('full');
    mockSync.mockResolvedValue({ status: 'OK', message: 'done' });
    renderTable();

    await call(row().onBankConnectionAction, 'syncNow', CONNECTED);

    expect(mockSync).toHaveBeenCalledWith('acc-1');
    expect(toastSuccess).toHaveBeenCalledWith('done');
    expect(onDataMutated).toHaveBeenCalled();
  });

  it('ignores reconnect under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    mockLaunchPopup.mockResolvedValue('conn-1');
    renderTable();

    await call(row().onBankConnectionAction, 'reconnect', CONNECTED);

    expect(mockLaunchPopup).not.toHaveBeenCalled();
    expect(mockFinishReconnect).not.toHaveBeenCalled();
  });

  it('runs the reconnect handshake under full access (ETP-5457 twin)', async () => {
    setTier('full');
    mockLaunchPopup.mockResolvedValue('conn-1');
    mockFinishReconnect.mockResolvedValue(undefined);
    renderTable();

    await call(row().onBankConnectionAction, 'reconnect', CONNECTED);

    expect(mockLaunchPopup).toHaveBeenCalledTimes(1);
    expect(mockFinishReconnect).toHaveBeenCalledWith('acc-1', 'conn-1');
  });

  it('ignores disconnect under the read-only tier — no confirm dialog (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(row().onBankConnectionAction, 'disconnect', CONNECTED);

    expect(screen.getByTestId('disconnect-confirm')).toHaveAttribute('data-open', 'false');
  });

  it('asks for confirmation before a disconnect under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(row().onBankConnectionAction, 'disconnect', CONNECTED);

    expect(screen.getByTestId('disconnect-confirm')).toHaveAttribute('data-open', 'true');
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('ignores deleteConnection under the read-only tier — no warning cartel (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(row().onBankConnectionAction, 'deleteConnection', CONNECTED);

    expect(screen.queryByTestId('delete-connection-modal')).not.toBeInTheDocument();
  });

  it('shows the warning cartel for deleteConnection under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(row().onBankConnectionAction, 'deleteConnection', CONNECTED);

    expect(screen.getByTestId('delete-connection-modal')).toBeInTheDocument();
  });

  it('ignores the edit modal\'s onConnect under the read-only tier (ETP-5457)', async () => {
    setTier('read-only');
    renderTable();

    await call(editModalProps.onConnect, CONNECTED);

    expect(mockStartConnect).not.toHaveBeenCalled();
  });

  it('starts the connect flow from the edit modal\'s onConnect under full access (ETP-5457 twin)', async () => {
    setTier('full');
    renderTable();

    await call(editModalProps.onConnect, CONNECTED);

    expect(mockStartConnect).toHaveBeenCalledWith(CONNECTED);
  });
});

/**
 * Each dialog is opened under full access, then the tier turns read-only and the slot is
 * re-rendered: the dialog must be shut although its own state still points at an account. The
 * twin re-renders under full access and the dialog stays open.
 */
describe('AccountsHeaderTable — write dialogs forced closed (ETP-5457)', () => {
  const DIALOGS = [
    {
      name: 'NewAccountWizard',
      open: () => call(toolbarProps.onNewAccount),
      isOpen: () => screen.getByTestId('wizard').getAttribute('data-open') === 'true',
    },
    {
      name: 'EditAccountModal',
      open: () => call(row().onEdit, CONNECTED),
      isOpen: () => screen.getByTestId('edit-modal').getAttribute('data-open') === 'true',
    },
    {
      name: 'ArchiveAccountDialog',
      open: () => call(row().onArchive, CONNECTED),
      isOpen: () => screen.getByTestId('archive-dialog').getAttribute('data-open') === 'true',
    },
    {
      name: 'DeleteAccountDialog',
      open: () => call(row().onDelete, CONNECTED),
      isOpen: () => screen.getByTestId('delete-dialog').getAttribute('data-open') === 'true',
    },
    {
      name: 'disconnect ConfirmDialog',
      open: () => call(row().onBankConnectionAction, 'disconnect', CONNECTED),
      isOpen: () => screen.getByTestId('disconnect-confirm').getAttribute('data-open') === 'true',
    },
    {
      name: 'BankConnectionDeleteConfirmModal',
      open: () => call(row().onBankConnectionAction, 'deleteConnection', CONNECTED),
      isOpen: () => screen.queryByTestId('delete-connection-modal') !== null,
    },
    {
      name: 'FundsTransferModal',
      open: () => call(row().onTransfer, CONNECTED),
      isOpen: () => screen.queryByTestId('transfer-modal') !== null,
    },
  ];

  it.each(DIALOGS)('shuts the $name once the tier turns read-only (ETP-5457)', async ({ open, isOpen }) => {
    setTier('full');
    const { rerender } = renderTable();
    await open();
    expect(isOpen()).toBe(true);

    setTier('read-only');
    rerenderTable(rerender);

    expect(isOpen()).toBe(false);
  });

  it.each(DIALOGS)('keeps the $name open while the tier stays full (ETP-5457 twin)', async ({ open, isOpen }) => {
    setTier('full');
    const { rerender } = renderTable();
    await open();

    rerenderTable(rerender);

    expect(isOpen()).toBe(true);
  });
});

// runDisconnect's own early return: the disconnect target is set under full access, the tier
// flips, and the ConfirmDialog's onConfirm from the read-only render is invoked directly.
describe('AccountsHeaderTable — runDisconnect guard (ETP-5457)', () => {
  it('does not disconnect when confirmed under the read-only tier (ETP-5457)', async () => {
    setTier('full');
    mockDisconnect.mockResolvedValue({ disconnected: true });
    const { rerender } = renderTable();
    await call(row().onBankConnectionAction, 'disconnect', CONNECTED);

    setTier('read-only');
    rerenderTable(rerender);
    await call(confirmDialogProps.onConfirm);

    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onDataMutated).not.toHaveBeenCalled();
  });

  it('disconnects when confirmed under full access (ETP-5457 twin)', async () => {
    setTier('full');
    mockDisconnect.mockResolvedValue({ disconnected: true });
    const { rerender } = renderTable();
    await call(row().onBankConnectionAction, 'disconnect', CONNECTED);

    rerenderTable(rerender);
    await call(confirmDialogProps.onConfirm);

    expect(mockDisconnect).toHaveBeenCalledWith('acc-1', { permanentDeletion: false });
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountsBankConnectionDisconnectDone');
    expect(onDataMutated).toHaveBeenCalled();
  });
});
