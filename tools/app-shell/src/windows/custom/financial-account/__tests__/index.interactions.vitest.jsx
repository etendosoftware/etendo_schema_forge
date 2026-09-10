/**
 * FinancialAccountDetail — the wiring that `index.vitest.jsx` (data hooks + CSV export
 * happy paths) and `index.wrapper.vitest.jsx` (list/detail branch) leave untested:
 *
 *  - the deep-link effect that consumes `tab` / `txn` / `autoMatch` / `newMovement`
 *    from the query string and then clears it;
 *  - the ETP-4658 access-tier gate (`useWindowAccess` → `WindowAccessGuard`);
 *  - the toolbar buttons (Edit, Automatch) and the reload fan-out after an automatch or
 *    a reconcile;
 *  - the Edit → Archive / Edit → Connect hand-offs and the post-archive navigation;
 *  - the error branches of both CSV exports.
 *
 * Every child is stubbed (each has its own suite) so the assertions are about the
 * callbacks crossing the boundary, not about any child's internals.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';

let currentSearchParams = new URLSearchParams();
const setSearchParamsMock = vi.fn();
const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [currentSearchParams, setSearchParamsMock],
  useParams: () => ({ recordId: 'acc-1' }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

let currentWindowAccessTier = 'full';
vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: (...args) => {
    windowAccessCalls.push(args);
    return currentWindowAccessTier;
  },
  WindowAccessGuard: ({ windowId }) => (
    <div data-testid="window-access-guard" data-window-id={windowId} />
  ),
}));
const windowAccessCalls = [];

const reloadAccountMock = vi.fn();
const reloadMovementsMock = vi.fn();
const reloadAutoMatchMock = vi.fn();
vi.mock('@/hooks/useReconciliationList', () => ({
  // `reload` included on purpose: the real hook always returns one, and the account page calls
  // it as part of its full refresh. A mock missing it throws only once some path happens to
  // reach that call — which is how it stayed unnoticed until saving the edit modal did.
  useReconciliations: () => ({ reconciliations: [], loading: false, reload: vi.fn() }),
  useClearedItems: () => ({ items: [], loading: false }),
}));
vi.mock('@/hooks/useFinancialAccount', () => ({
  useFinancialAccount: () => ({
    account: { id: 'acc-1', name: 'BBVA', pendingCount: 2 },
    loading: false,
    error: null,
    reload: reloadAccountMock,
  }),
}));
vi.mock('@/hooks/useAccountMovements', () => ({
  useAccountMovements: () => ({
    movements: currentMovements,
    totals: { balance: 0, currency: 'EUR' },
    loading: false,
    error: null,
    reload: reloadMovementsMock,
  }),
}));
let currentMovements = [{ id: 'm1' }];
vi.mock('@/hooks/useBankStatements', () => ({
  useBankStatements: () => ({ statements: [{ id: 's1' }], loading: false, reload: vi.fn() }),
}));
const autoMatchCalls = [];
// ETP-4922: the modal's open decision now depends on the *fresh* groups/loading pair coming back
// from `useAutoMatch`, so — same pattern as `currentMovements` / `mockMovementsApi` above — these
// are module-level `let`s a test can flip mid-run (typically via `rerender()`) to simulate the
// loading:true -> loading:false transition the real `useNeoResource` goes through.
let currentAutoMatchGroups = [];
let currentAutoMatchLoading = false;
vi.mock('@/hooks/useReconciliation', () => ({
  useAutoMatch: (id) => {
    autoMatchCalls.push(id);
    return {
      groups: currentAutoMatchGroups,
      kpis: {},
      loading: currentAutoMatchLoading,
      error: null,
      reload: reloadAutoMatchMock,
    };
  },
}));

const exportCsvMock = vi.fn(() => Promise.resolve());
vi.mock('@/hooks/useCsvExport', () => ({
  useCsvExport: () => exportCsvMock,
}));

const startConnectMock = vi.fn();
vi.mock('@/hooks/useBankConnectionFlow', () => ({
  useBankConnectionFlow: (opts) => {
    bankFlowOptions = opts;
    return {
      startConnect: startConnectMock,
      startCreate: vi.fn(),
      connecting: false,
      selection: null,
      confirmSelection: vi.fn(),
      cancelSelection: vi.fn(),
    };
  },
}));
let bankFlowOptions = null;

vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...a) => toastErrorMock(...a),
    success: (...a) => toastSuccessMock(...a),
  },
}));

// --- child stubs: each exposes the callbacks index.jsx hands it as clickable buttons ---
vi.mock('../MovementsTab.jsx', () => ({
  MovementsTab: forwardRef(function MovementsTabStub(props, ref) {
    movementsTabProps = props;
    useImperativeHandle(ref, () => ({
      getFilteredMovements: () => mockMovementsApi.filtered,
    }));
    return <div data-testid="tab-movements" />;
  }),
}));
let movementsTabProps = null;
let mockMovementsApi = { filtered: [{ id: 'm1' }] };

vi.mock('../ReconciliationTab.jsx', () => ({
  ReconciliationTab: ({ onReconcileSuccess }) => (
    <div data-testid="tab-reconciliation">
      <button type="button" data-testid="stub-reconcile-success" onClick={onReconcileSuccess} />
    </div>
  ),
}));

let mockStatementsApi = { selected: [], filtered: [] };
vi.mock('../ImportedStatementsTab.jsx', () => ({
  ImportedStatementsTab: forwardRef(function ImportedStatementsTabStub(_props, ref) {
    useImperativeHandle(ref, () => ({
      getSelectedStatementIds: () => mockStatementsApi.selected,
      getFilteredStatements: () => mockStatementsApi.filtered,
    }));
    return <div data-testid="tab-statements" />;
  }),
}));

vi.mock('../EditAccountModal.jsx', () => ({
  EditAccountModal: ({ open, account, onClose, onSaved, onArchive, onDelete, onConnect }) => (
    <div data-testid="edit-modal" data-open={String(open)}>
      <button type="button" data-testid="stub-edit-close" onClick={onClose} />
      <button type="button" data-testid="stub-edit-saved" onClick={onSaved} />
      <button type="button" data-testid="stub-edit-archive" onClick={() => onArchive(account)} />
      <button type="button" data-testid="stub-edit-delete" onClick={() => onDelete(account)} />
      <button type="button" data-testid="stub-edit-connect" onClick={() => onConnect(account)} />
    </div>
  ),
}));

vi.mock('../ArchiveAccountDialog.jsx', () => ({
  ArchiveAccountDialog: ({ open, account, onClose, onArchived }) => (
    <div data-testid="archive-dialog" data-open={String(open)} data-account={account?.name ?? ''}>
      <button type="button" data-testid="stub-archive-close" onClick={onClose} />
      <button type="button" data-testid="stub-archive-archived" onClick={onArchived} />
    </div>
  ),
}));

// ETP-4871 — a sibling of ArchiveAccountDialog, not a mode of it (see DeleteAccountDialog.jsx's
// own doc comment): mirrors the archive stub's shape 1:1, but its callback is `onDeleted`.
vi.mock('../DeleteAccountDialog.jsx', () => ({
  DeleteAccountDialog: ({ open, account, onClose, onDeleted }) => (
    <div data-testid="delete-dialog" data-open={String(open)} data-account={account?.name ?? ''}>
      <button type="button" data-testid="stub-delete-close" onClick={onClose} />
      <button type="button" data-testid="stub-delete-deleted" onClick={onDeleted} />
    </div>
  ),
}));

vi.mock('../BankConnectionFlowUI.jsx', () => ({
  BankConnectionFlowUI: () => <div data-testid="bank-connection-flow" />,
}));

vi.mock('@/components/contract-ui/AutoMatchSuggestionModal', () => ({
  AutoMatchSuggestionModal: ({ open, onClose, onSuccess }) => (
    <div data-testid="automatch-modal" data-open={String(open)}>
      <button type="button" data-testid="stub-automatch-close" onClick={onClose} />
      <button type="button" data-testid="stub-automatch-success" onClick={onSuccess} />
    </div>
  ),
}));

import { FinancialAccountDetail } from '../index.jsx';

const WINDOW_ID = '94EAA455D2644E04AB25D93BE5157B6D';

beforeEach(() => {
  currentSearchParams = new URLSearchParams();
  currentWindowAccessTier = 'full';
  currentMovements = [{ id: 'm1' }];
  mockMovementsApi = { filtered: [{ id: 'm1' }] };
  mockStatementsApi = { selected: [], filtered: [] };
  windowAccessCalls.length = 0;
  autoMatchCalls.length = 0;
  currentAutoMatchGroups = [];
  currentAutoMatchLoading = false;
  movementsTabProps = null;
  bankFlowOptions = null;
  setSearchParamsMock.mockClear();
  navigateMock.mockClear();
  reloadAccountMock.mockClear();
  reloadMovementsMock.mockClear();
  reloadAutoMatchMock.mockClear();
  startConnectMock.mockClear();
  toastErrorMock.mockClear();
  toastSuccessMock.mockClear();
  exportCsvMock.mockReset();
  exportCsvMock.mockResolvedValue(undefined);
});

describe('FinancialAccountDetail — access tier gate (ETP-4658)', () => {
  it('renders the guard instead of the tabs when the tier is "none"', () => {
    currentWindowAccessTier = 'none';
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('window-access-guard')).toHaveAttribute('data-window-id', WINDOW_ID);
    expect(screen.queryByTestId('tab-movements')).not.toBeInTheDocument();
  });

  it('checks the tier against the window id carried by the contract', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(windowAccessCalls.at(0)).toEqual([WINDOW_ID]);
  });

  it('renders the window for the read-only tier (only "none" is gated)', () => {
    currentWindowAccessTier = 'read-only';
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('tab-movements')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-guard')).not.toBeInTheDocument();
  });
});

describe('FinancialAccountDetail — deep-link query params', () => {
  it('leaves the defaults alone and does not rewrite the URL with no params', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('tab-movements')).toBeInTheDocument();
    expect(setSearchParamsMock).not.toHaveBeenCalled();
  });

  it('applies tab + txn + autoMatch + newMovement and then clears the query string', () => {
    currentSearchParams = new URLSearchParams(
      'tab=movements&txn=txn-77&autoMatch=true&newMovement=true',
    );
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('tab-movements')).toBeInTheDocument();
    expect(movementsTabProps.highlightTxnId).toBe('txn-77');
    expect(movementsTabProps.autoOpenNewMovement).toBe(true);
    // ETP-4922: `autoMatch=true` arms the check, but the tab stays on Movements — the engine is
    // only ever queried with a real account id while ON the reconciliation tab, so nothing ever
    // fetches here and the modal never gets a fresh response to open on. It stays closed.
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');
    expect(setSearchParamsMock).toHaveBeenCalledWith({}, { replace: true });
  });

  it('opens the automatch modal for a deep link to the reconciliation tab once suggestions land (ETP-4922)', () => {
    currentSearchParams = new URLSearchParams('tab=reconciliation');
    currentAutoMatchLoading = true;
    const { rerender } = render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('tab-reconciliation')).toBeInTheDocument();
    // Still fetching — must not pop the modal before a response has actually landed.
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');

    // The fetch resolves with at least one suggestion group.
    currentAutoMatchGroups = [{ groupKey: 'g1' }];
    currentAutoMatchLoading = false;
    rerender(<FinancialAccountDetail recordId="acc-1" />);

    // Entering the tab is what triggers the fetch; it's the FRESH response that decides whether
    // the modal opens, not the tab switch itself.
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'true');
    expect(autoMatchCalls).toContain('acc-1');
  });

  it('deep-links straight to the statements tab without opening the automatch modal', () => {
    currentSearchParams = new URLSearchParams('tab=statements');
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('tab-statements')).toBeInTheDocument();
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');
    expect(autoMatchCalls.every((id) => id === null)).toBe(true);
  });

  // ETP-4891: the payment modal's "PSD2 connection inactive" warning links here, so the user lands
  // straight on the Editar Cuenta modal where Reconectar lives instead of having to find it.
  it('opens the edit modal for ?edit=true and then clears the query string', () => {
    currentSearchParams = new URLSearchParams('edit=true');
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'true');
    expect(setSearchParamsMock).toHaveBeenCalledWith({}, { replace: true });
  });

  it('leaves the edit modal closed for any other value of the edit param', () => {
    currentSearchParams = new URLSearchParams('edit=false');
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
  });

  it('clears the highlighted transaction when the user switches tabs by hand', () => {
    currentSearchParams = new URLSearchParams('txn=txn-77');
    render(<FinancialAccountDetail recordId="acc-1" />);
    expect(movementsTabProps.highlightTxnId).toBe('txn-77');

    fireEvent.click(screen.getByTestId('detail-tab-statements'));
    fireEvent.click(screen.getByTestId('detail-tab-movements'));

    expect(movementsTabProps.highlightTxnId).toBeNull();
  });
});

describe('FinancialAccountDetail — automatch modal', () => {
  it('does not auto-open when entering the reconciliation tab finds zero suggestions, but the manual button still opens it (ETP-4922)', () => {
    currentAutoMatchGroups = [];
    render(<FinancialAccountDetail recordId="acc-1" />);

    fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));
    // Entering the tab with zero suggestions must NOT auto-open the modal.
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');

    // The manual button bypasses the armed/loading gate entirely — it always opens, showing the
    // empty state when there is nothing to suggest.
    fireEvent.click(screen.getByTestId('financial-account-automatch'));

    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'true');
  });

  it('fetches automatch data while the tab is active but does not open the modal when the response has zero suggestions (ETP-4922)', () => {
    currentSearchParams = new URLSearchParams('tab=reconciliation');
    currentAutoMatchLoading = true;
    const { rerender } = render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');

    currentAutoMatchGroups = [];
    currentAutoMatchLoading = false;
    rerender(<FinancialAccountDetail recordId="acc-1" />);

    // The engine WAS queried for this account — it just found nothing to suggest.
    expect(autoMatchCalls).toContain('acc-1');
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');
  });

  it('re-arms the automatch check after leaving and returning to the reconciliation tab (ETP-4922)', () => {
    const { rerender } = render(<FinancialAccountDetail recordId="acc-1" />);

    currentAutoMatchLoading = true;
    fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');

    currentAutoMatchGroups = [{ groupKey: 'g1' }];
    currentAutoMatchLoading = false;
    rerender(<FinancialAccountDetail recordId="acc-1" />);
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'true');

    // Close it manually, then leave the tab — this must disarm the stale "fetched" state so a
    // late-resolving response from the previous visit can't pop it back open later.
    fireEvent.click(screen.getByTestId('stub-automatch-close'));
    fireEvent.click(screen.getByTestId('detail-tab-movements'));
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');

    // Coming back with a fresh, non-empty response must reopen it — proves re-arming works, not
    // just the initial-mount path.
    currentAutoMatchGroups = [];
    currentAutoMatchLoading = true;
    fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');

    currentAutoMatchGroups = [{ groupKey: 'g2' }];
    currentAutoMatchLoading = false;
    rerender(<FinancialAccountDetail recordId="acc-1" />);
    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'true');
  });

  it('reloads the account, the automatch groups and the movements after a successful apply', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);

    fireEvent.click(screen.getByTestId('stub-automatch-success'));

    expect(reloadAccountMock).toHaveBeenCalled();
    expect(reloadAutoMatchMock).toHaveBeenCalled();
    expect(reloadMovementsMock).toHaveBeenCalled();
  });

  it('remounts the reconciliation panel after an apply so the matching re-runs', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));
    const before = screen.getByTestId('tab-reconciliation');

    fireEvent.click(screen.getByTestId('stub-automatch-success'));

    // A new key forces a fresh node rather than an in-place update.
    expect(screen.getByTestId('tab-reconciliation')).not.toBe(before);
  });

  it('reloads all three data sources after a manual reconcile', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));

    fireEvent.click(screen.getByTestId('stub-reconcile-success'));

    expect(reloadAccountMock).toHaveBeenCalled();
    expect(reloadMovementsMock).toHaveBeenCalled();
    expect(reloadAutoMatchMock).toHaveBeenCalled();
  });
});

describe('FinancialAccountDetail — edit / archive / connect hand-offs', () => {
  it('opens the edit modal from the toolbar button', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByTestId('financial-account-edit'));

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'true');
  });

  it('closes the edit modal through its onClose', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('financial-account-edit'));

    fireEvent.click(screen.getByTestId('stub-edit-close'));

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
  });

  it('reloads the account when the edit modal saves', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);

    fireEvent.click(screen.getByTestId('stub-edit-saved'));

    expect(reloadAccountMock).toHaveBeenCalled();
  });

  it('swaps the edit modal for the archive dialog on Archive', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('financial-account-edit'));

    fireEvent.click(screen.getByTestId('stub-edit-archive'));

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-account', 'BBVA');
  });

  it('dismisses the archive dialog without navigating away', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('stub-edit-archive'));

    fireEvent.click(screen.getByTestId('stub-archive-close'));

    expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'false');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('returns to the accounts list once the account has been archived', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('stub-edit-archive'));

    fireEvent.click(screen.getByTestId('stub-archive-archived'));

    expect(screen.getByTestId('archive-dialog')).toHaveAttribute('data-open', 'false');
    expect(navigateMock).toHaveBeenCalledWith('/financial-account');
  });

  it('closes the edit modal and starts the bank connect flow on Connect', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('financial-account-edit'));

    fireEvent.click(screen.getByTestId('stub-edit-connect'));

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
    expect(startConnectMock).toHaveBeenCalledWith({ id: 'acc-1', name: 'BBVA', pendingCount: 2 });
  });

  it('reloads the account when the bank connect flow finishes', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);

    bankFlowOptions.onDone();

    expect(reloadAccountMock).toHaveBeenCalled();
  });
});

// ETP-4871 — same shape as the archive hand-offs above, but Delete has no restore/stay branch:
// a real delete always navigates back to the list.
describe('FinancialAccountDetail — edit / delete hand-offs (ETP-4871)', () => {
  it('swaps the edit modal for the delete dialog on Delete', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('financial-account-edit'));

    fireEvent.click(screen.getByTestId('stub-edit-delete'));

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('delete-dialog')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('delete-dialog')).toHaveAttribute('data-account', 'BBVA');
  });

  it('dismisses the delete dialog without navigating away', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('stub-edit-delete'));

    fireEvent.click(screen.getByTestId('stub-delete-close'));

    expect(screen.getByTestId('delete-dialog')).toHaveAttribute('data-open', 'false');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('returns to the accounts list once the account has been deleted', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);
    fireEvent.click(screen.getByTestId('stub-edit-delete'));

    fireEvent.click(screen.getByTestId('stub-delete-deleted'));

    expect(screen.getByTestId('delete-dialog')).toHaveAttribute('data-open', 'false');
    expect(navigateMock).toHaveBeenCalledWith('/financial-account');
  });
});

describe('FinancialAccountDetail — CSV export failures', () => {
  it('toasts an error when the movements export request fails', async () => {
    exportCsvMock.mockRejectedValueOnce(new Error('boom'));
    render(<FinancialAccountDetail recordId="acc-1" />);

    fireEvent.click(screen.getByTestId('financial-account-export'));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('financeAccountDetailExportError'),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('toasts an error when the statement-lines export request fails', async () => {
    mockStatementsApi = { selected: ['s1'], filtered: [{ id: 's1' }] };
    exportCsvMock.mockRejectedValueOnce(new Error('boom'));
    render(<FinancialAccountDetail recordId="acc-1" />);

    fireEvent.click(screen.getByTestId('detail-tab-statements'));
    fireEvent.click(screen.getByTestId('financial-account-export'));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('financeAccountDetailExportError'),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
