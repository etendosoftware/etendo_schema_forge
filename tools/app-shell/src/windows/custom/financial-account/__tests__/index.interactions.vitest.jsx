// @covers tools/app-shell/src/windows/custom/financial-account/index.jsx
// @covers tools/app-shell/src/windows/custom/financial-account/BounceReviewBanner.jsx
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

// The key itself; the bounce-review "back" button also shows its count, which is what the banner
// promises the user (ETP-5581).
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (key === 'financeReconcileBounceReviewBack' ? `${key} (${params?.count})` : key),
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
// `type` is undefined (a bank account) unless a test sets it — ETP-5457 flips it to CASH to mount
// the cash-close branch of the reconciliation tab.
let currentAccountType;
vi.mock('@/hooks/useFinancialAccount', () => ({
  useFinancialAccount: () => ({
    account: { id: 'acc-1', name: 'BBVA', pendingCount: 2, type: currentAccountType },
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

// ETP-5581 — `bounceReview` (the shared bounce-pair review state) is surfaced as attributes, and
// its two callbacks as buttons, so the tests can drive the panel side of a review.
vi.mock('../ReconciliationTab.jsx', () => ({
  ReconciliationTab: ({ onReconcileSuccess, windowReadOnly, bounceReview }) => (
    <div
      data-testid="tab-reconciliation"
      data-window-read-only={String(windowReadOnly)}
      data-focus-line={bounceReview?.focus?.lineId ?? ''}
      data-dismissed={[...(bounceReview?.dismissedKeys ?? [])].join(',')}>
      <button type="button" data-testid="stub-reconcile-success" onClick={onReconcileSuccess} />
      <button type="button" data-testid="stub-panel-dismiss" onClick={() => bounceReview?.onDismiss('bp-review')} />
      <button type="button" data-testid="stub-panel-focus-consumed" onClick={() => bounceReview?.onFocusConsumed()} />
    </div>
  ),
}));

let mockStatementsApi = { selected: [], filtered: [] };
vi.mock('../ImportedStatementsTab.jsx', () => ({
  ImportedStatementsTab: forwardRef(function ImportedStatementsTabStub(props, ref) {
    useImperativeHandle(ref, () => ({
      getSelectedStatementIds: () => mockStatementsApi.selected,
      getFilteredStatements: () => mockStatementsApi.filtered,
    }));
    return <div data-testid="tab-statements" data-window-read-only={String(props.windowReadOnly)} />;
  }),
}));

// ETP-5457 — only mounted for a CASH account (see `currentAccountType`).
vi.mock('../CashClose/index.jsx', () => ({
  CashCloseTab: ({ windowReadOnly }) => (
    <div data-testid="tab-cash-close" data-window-read-only={String(windowReadOnly)} />
  ),
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

// ETP-5581 — the host-owned checks (`selection`), the dismissed pairs and "Revisar en el panel"
// (`onReviewPair`) are surfaced the same way; `onReviewPair` and the toggle act on the `bp-review` pair.
vi.mock('@/components/contract-ui/AutoMatchSuggestionModal', () => ({
  AutoMatchSuggestionModal: ({
    open, onClose, onSuccess, groups, selection, dismissedPairKeys, onReviewPair,
  }) => {
    const reviewPair = (groups ?? []).find((g) => g.groupKey === 'bp-review');
    return (
      <div
        data-testid="automatch-modal"
        data-open={String(open)}
        data-checked={(groups ?? []).filter((g) => selection?.isChecked(g)).map((g) => g.groupKey).join(',')}
        data-dismissed={[...(dismissedPairKeys ?? [])].join(',')}>
        <button type="button" data-testid="stub-automatch-close" onClick={onClose} />
        <button type="button" data-testid="stub-automatch-success" onClick={onSuccess} />
        <button type="button" data-testid="stub-automatch-review" onClick={() => onReviewPair?.(reviewPair)} />
        <button type="button" data-testid="stub-automatch-toggle-review" onClick={() => selection?.toggle(reviewPair)} />
      </div>
    );
  },
}));

import { FinancialAccountDetail } from '../index.jsx';
import { ACCOUNT_TYPE } from '@/components/financial-accounts/tokens';

const WINDOW_ID = '94EAA455D2644E04AB25D93BE5157B6D';

beforeEach(() => {
  currentSearchParams = new URLSearchParams();
  currentWindowAccessTier = 'full';
  currentAccountType = undefined;
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

  it('renders the window for the read-only tier — "none" still blocks entirely, "read-only" mounts read-only', () => {
    currentWindowAccessTier = 'read-only';
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('tab-movements')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-guard')).not.toBeInTheDocument();
  });

  it('hides the Edit and AutoMatch buttons when the tier is read-only (ETP-5205)', () => {
    currentWindowAccessTier = 'read-only';
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.queryByTestId('financial-account-edit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('financial-account-automatch')).not.toBeInTheDocument();
  });

  it('the Edit modal never mounts open under read-only, even via the ?edit=true deep-link (ETP-5205)', () => {
    currentWindowAccessTier = 'read-only';
    currentSearchParams = new URLSearchParams('edit=true');
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('edit-modal')).toHaveAttribute('data-open', 'false');
  });

  it('the AutoMatch modal never mounts open under read-only, even once suggestions land (ETP-5205)', () => {
    currentWindowAccessTier = 'read-only';
    currentSearchParams = new URLSearchParams('tab=reconciliation');
    currentAutoMatchLoading = true;
    const { rerender } = render(<FinancialAccountDetail recordId="acc-1" />);

    currentAutoMatchGroups = [{ groupKey: 'g1' }];
    currentAutoMatchLoading = false;
    rerender(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('automatch-modal')).toHaveAttribute('data-open', 'false');
  });
});

// ETP-5457 — the read-only tier now reaches the three tabs that ETP-5205 left writable. Each tab
// closes its own write paths (see their suites); what the host owes them is the prop. A dropped
// prop is silent — the tab simply stays writable — so each mount is asserted both ways.
describe('FinancialAccountDetail — read-only tier reaches every tab (ETP-5457)', () => {
  const TIERS = [['read-only', 'true'], ['full', 'false']];

  it.each(TIERS)('hands windowReadOnly to ReconciliationTab for tier %s (ETP-5457)', (tier, expected) => {
    currentWindowAccessTier = tier;
    currentSearchParams = new URLSearchParams('tab=reconciliation');
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('tab-reconciliation'))
      .toHaveAttribute('data-window-read-only', expected);
    expect(screen.queryByTestId('tab-cash-close')).not.toBeInTheDocument();
  });

  it.each(TIERS)('hands windowReadOnly to CashCloseTab for tier %s on a cash account (ETP-5457)', (tier, expected) => {
    currentWindowAccessTier = tier;
    currentAccountType = ACCOUNT_TYPE.CASH;
    currentSearchParams = new URLSearchParams('tab=reconciliation');
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('tab-cash-close')).toHaveAttribute('data-window-read-only', expected);
    expect(screen.queryByTestId('tab-reconciliation')).not.toBeInTheDocument();
  });

  it.each(TIERS)('hands windowReadOnly to ImportedStatementsTab for tier %s (ETP-5457)', (tier, expected) => {
    currentWindowAccessTier = tier;
    currentSearchParams = new URLSearchParams('tab=statements');
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('tab-statements')).toHaveAttribute('data-window-read-only', expected);
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

// ---------------------------------------------------------------------------
// ETP-5581 — "Revisar en el panel": the review state index.jsx owns and shares between the
// automatch modal and the reconciliation panel (useAutoMatchReview + BounceReviewBanner).
// ---------------------------------------------------------------------------

describe('FinancialAccountDetail — bounce-pair review (Revisar en el panel)', () => {
  const TX = { groupKey: 'tx-1', statementLine: { id: 'S1' }, operations: [{ id: 'op-1' }] };
  const HIGH = {
    kind: 'bouncePair', groupKey: 'bp-high', confidence: 'high',
    statementLine: { id: 'O1' }, counterpartLine: { id: 'B1' },
  };
  const REVIEW = {
    kind: 'bouncePair', groupKey: 'bp-review', confidence: 'review',
    statementLine: { id: 'O2' }, counterpartLine: { id: 'B2' },
  };
  const PAIR_GROUPS = [TX, HIGH, REVIEW];

  const modal = () => screen.getByTestId('automatch-modal');

  /** Enters the reconciliation tab and lets the automatch answer land: the modal auto-opens. */
  function renderWithPairs() {
    const utils = render(<FinancialAccountDetail recordId="acc-1" />);
    currentAutoMatchLoading = true;
    fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));
    currentAutoMatchGroups = PAIR_GROUPS;
    currentAutoMatchLoading = false;
    utils.rerender(<FinancialAccountDetail recordId="acc-1" />);
    expect(modal()).toHaveAttribute('data-open', 'true');
    return utils;
  }

  it('starts with the default checks and no banner', () => {
    renderWithPairs();
    expect(modal()).toHaveAttribute('data-checked', 'tx-1,bp-high');
    expect(screen.queryByTestId('recon-bounce-review-banner')).not.toBeInTheDocument();
  });

  it('hides the modal, asks the panel for the bounce line and shows the banner with the count', () => {
    renderWithPairs();
    fireEvent.click(screen.getByTestId('stub-automatch-review'));

    expect(modal()).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('tab-reconciliation')).toHaveAttribute('data-focus-line', 'B2');
    expect(screen.getByTestId('recon-bounce-review-banner')).toHaveTextContent('financeReconcileBounceReviewBanner');
    expect(screen.getByTestId('recon-bounce-review-back')).toHaveTextContent('financeReconcileBounceReviewBack (3)');
  });

  it('counts only the suggestions still offered: a dismissed pair leaves the banner count', () => {
    renderWithPairs();
    fireEvent.click(screen.getByTestId('stub-automatch-review'));
    fireEvent.click(screen.getByTestId('stub-panel-dismiss'));
    expect(screen.getByTestId('recon-bounce-review-back')).toHaveTextContent('financeReconcileBounceReviewBack (2)');
    expect(screen.getByTestId('tab-reconciliation')).toHaveAttribute('data-dismissed', 'bp-review');
    expect(modal()).toHaveAttribute('data-dismissed', 'bp-review');
  });

  it('"Volver" reopens the modal with the checks as they were left, even across a reload', () => {
    const { rerender } = renderWithPairs();
    fireEvent.click(screen.getByTestId('stub-automatch-toggle-review'));
    expect(modal()).toHaveAttribute('data-checked', 'tx-1,bp-high,bp-review');
    fireEvent.click(screen.getByTestId('stub-automatch-review'));

    // A discard in the panel reloads the suggestions (a new array, same groups).
    currentAutoMatchGroups = [...PAIR_GROUPS];
    rerender(<FinancialAccountDetail recordId="acc-1" />);

    fireEvent.click(screen.getByTestId('recon-bounce-review-back'));
    expect(modal()).toHaveAttribute('data-open', 'true');
    expect(modal()).toHaveAttribute('data-checked', 'tx-1,bp-high,bp-review');
    // The banner steps aside while the modal is open.
    expect(screen.queryByTestId('recon-bounce-review-banner')).not.toBeInTheDocument();
  });

  it('does not reopen the modal on its own while the review goes on', () => {
    const { rerender } = renderWithPairs();
    fireEvent.click(screen.getByTestId('stub-automatch-review'));

    currentAutoMatchLoading = true;
    rerender(<FinancialAccountDetail recordId="acc-1" />);
    currentAutoMatchGroups = [...PAIR_GROUPS];
    currentAutoMatchLoading = false;
    rerender(<FinancialAccountDetail recordId="acc-1" />);

    expect(modal()).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('recon-bounce-review-banner')).toBeInTheDocument();
  });

  it('closing the modal ends the review: no banner afterwards', () => {
    renderWithPairs();
    fireEvent.click(screen.getByTestId('stub-automatch-review'));
    fireEvent.click(screen.getByTestId('recon-bounce-review-back'));
    fireEvent.click(screen.getByTestId('stub-automatch-close'));
    expect(modal()).toHaveAttribute('data-open', 'false');
    expect(screen.queryByTestId('recon-bounce-review-banner')).not.toBeInTheDocument();
  });

  it('leaving the reconciliation tab ends the review and forgets the dismissals', () => {
    renderWithPairs();
    fireEvent.click(screen.getByTestId('stub-automatch-review'));
    fireEvent.click(screen.getByTestId('stub-panel-dismiss'));

    currentAutoMatchLoading = true;
    fireEvent.click(screen.getByTestId('detail-tab-movements'));
    fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));

    expect(screen.queryByTestId('recon-bounce-review-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('tab-reconciliation')).toHaveAttribute('data-dismissed', '');
    expect(screen.getByTestId('tab-reconciliation')).toHaveAttribute('data-focus-line', '');
  });

  it('the Automatch button clears the dismissals and opens the modal', () => {
    renderWithPairs();
    fireEvent.click(screen.getByTestId('stub-automatch-review'));
    fireEvent.click(screen.getByTestId('stub-panel-dismiss'));
    expect(modal()).toHaveAttribute('data-dismissed', 'bp-review');

    fireEvent.click(screen.getByTestId('financial-account-automatch'));
    expect(modal()).toHaveAttribute('data-open', 'true');
    expect(modal()).toHaveAttribute('data-dismissed', '');
  });

  it('the header refresh clears the dismissals (a fresh automatch run proposes them again)', () => {
    renderWithPairs();
    fireEvent.click(screen.getByTestId('stub-automatch-close'));
    fireEvent.click(screen.getByTestId('stub-panel-dismiss'));
    expect(screen.getByTestId('tab-reconciliation')).toHaveAttribute('data-dismissed', 'bp-review');

    fireEvent.click(screen.getByTestId('finance-refresh-button'));
    expect(reloadAutoMatchMock).toHaveBeenCalled();
    expect(screen.getByTestId('tab-reconciliation')).toHaveAttribute('data-dismissed', '');
  });

  it('the panel consumes the focus request', () => {
    renderWithPairs();
    fireEvent.click(screen.getByTestId('stub-automatch-review'));
    fireEvent.click(screen.getByTestId('stub-panel-focus-consumed'));
    expect(screen.getByTestId('tab-reconciliation')).toHaveAttribute('data-focus-line', '');
    // Consuming the focus does not end the review.
    expect(screen.getByTestId('recon-bounce-review-banner')).toBeInTheDocument();
  });
});
