import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';

// useSearchParams and useParams are used by FinancialAccountWindow and its children.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useParams: () => ({ recordId: 'test-account' }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// useAutoMatch is called by FinancialAccountWindow when the automatch modal is open.
vi.mock('@/hooks/useReconciliation', () => ({
  useAutoMatch: () => ({ groups: [], kpis: {}, loading: false, error: null, reload: vi.fn() }),
  useApplySuggestions: () => ({ apply: vi.fn(), loading: false, error: null }),
  usePendingStatementLines: () => ({ lines: [], total: 0, counts: {}, loading: false, reload: vi.fn() }),
  useCandidateOperations: () => ({ candidates: [], loading: false }),
  useReconcileGroup: () => ({ reconcile: vi.fn(), loading: false }),
}));

// Generic CSV export hook — stubbed so we assert the params without HTTP/auth.
const exportCsvMock = vi.fn(() => Promise.resolve());
vi.mock('@/hooks/useCsvExport', () => ({
  useCsvExport: () => exportCsvMock,
}));

const setMetaMock = vi.fn();
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (meta) => setMetaMock(meta),
}));

const toastFn = vi.fn();
const toastSuccessFn = vi.fn();
const toastErrorFn = vi.fn();
vi.mock('sonner', () => {
  const toast = (...args) => toastFn(...args);
  toast.success = (...args) => toastSuccessFn(...args);
  toast.error = (...args) => toastErrorFn(...args);
  return { toast };
});

// Stub the hook layer so the test runs without HTTP
const useFinancialAccountMock = vi.fn();
const useAccountMovementsMock = vi.fn();
const useBankStatementsMock = vi.fn();
const useReconciliationsMock = vi.fn();
vi.mock('@/hooks/useReconciliationList', () => ({
  useReconciliations: (...args) => useReconciliationsMock(...args),
  useClearedItems: () => ({ items: [], loading: false }),
}));
vi.mock('@/hooks/useFinancialAccount', () => ({
  useFinancialAccount: (...args) => useFinancialAccountMock(...args),
}));
vi.mock('@/hooks/useAccountMovements', () => ({
  useAccountMovements: (...args) => useAccountMovementsMock(...args),
}));
vi.mock('@/hooks/useBankStatements', () => ({
  useBankStatements: (...args) => useBankStatementsMock(...args),
}));

// Stub the three tabs so we can assert which one is mounted
vi.mock('../MovementsTab.jsx', () => ({
  MovementsTab: ({ movements, loading, account }) => (
    <div data-testid="tab-movements">
      <span data-testid="tab-movements-count">{movements.length}</span>
      <span data-testid="tab-movements-loading">{String(loading)}</span>
      <span data-testid="tab-movements-account">{account?.name ?? ''}</span>
    </div>
  ),
}));
vi.mock('../ReconciliationTab.jsx', () => ({
  ReconciliationTab: () => <div data-testid="tab-reconciliation" />,
}));
// Exposes the same ref API the real tab does, driven per-test by mockStatementsApi.
let mockStatementsApi = { selected: [], filtered: [] };
vi.mock('../ImportedStatementsTab.jsx', () => ({
  ImportedStatementsTab: forwardRef(function ImportedStatementsTabMock(_props, ref) {
    useImperativeHandle(ref, () => ({
      getSelectedStatementIds: () => mockStatementsApi.selected,
      getFilteredStatements: () => mockStatementsApi.filtered,
    }));
    return <div data-testid="tab-statements" />;
  }),
}));

// ETP-4530: Edit modal entry point — stubbed like the other child components above so this suite
// stays isolated from EditAccountModal's own dependencies (i18n locale switch, account mutations,
// bank connection actions, accounting configuration). EditAccountModal has its own dedicated test suite.
vi.mock('../EditAccountModal.jsx', () => ({
  EditAccountModal: ({ open, account }) => (
    <div data-testid="edit-account-modal-stub" data-open={String(open)} data-account={account?.name ?? ''} />
  ),
}));
vi.mock('../ArchiveAccountDialog.jsx', () => ({
  ArchiveAccountDialog: ({ open }) => (
    <div data-testid="archive-account-dialog-stub" data-open={String(open)} />
  ),
}));
// ETP-4871 — a sibling of ArchiveAccountDialog, not a mode of it: index.jsx mounts it the same
// unconditional way. Without this stub the REAL component renders and its own
// `useAccountMutations()` call reaches the real (unmocked) `useAuth()`, throwing "useAuth must
// be used within AuthProvider" for every test in this file (this suite mocks
// '@/auth/AuthContext.jsx' with only `useWindowAccess`/`WindowAccessGuard` — same isolation
// reason as the two mocks above and below).
vi.mock('../DeleteAccountDialog.jsx', () => ({
  DeleteAccountDialog: ({ open }) => (
    <div data-testid="delete-account-dialog-stub" data-open={String(open)} />
  ),
}));
// ETP-4530: index.jsx now runs useBankConnectionFlow (→ useBankConnectionActions → useAuth) itself so the Edit
// modal's "Connect bank" button works from this entry point too. Stubbed here for the same
// isolation reason as the two mocks above.
vi.mock('../BankConnectionFlowUI.jsx', () => ({
  BankConnectionFlowUI: ({ flow }) => (
    <div data-testid="bank-connection-flow-ui-stub" data-connecting={String(!!flow?.connecting)} />
  ),
}));
vi.mock('@/hooks/useBankConnectionFlow', () => ({
  useBankConnectionFlow: () => ({
    startConnect: vi.fn(), startCreate: vi.fn(), connecting: false,
    selection: null, confirmSelection: vi.fn(), cancelSelection: vi.fn(),
  }),
}));

// ETP-4658: FinancialAccountWindow is now gated by useWindowAccess — default to 'full' so this
// suite keeps exercising the window as before.
let currentWindowAccessTier = 'full';
vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: () => currentWindowAccessTier,
  WindowAccessGuard: () => <div data-testid="window-access-guard" />,
}));

import FinancialAccountWindow from '../index.jsx';

function setHooks({ account = { id: 'acc-1', name: 'BBVA', pendingCount: 4 }, movements = [], totals = { balance: 0, inflows: 0, outflows: 0, currency: 'EUR' }, loading = false, statements = [], reconciliations = [] } = {}) {
  useFinancialAccountMock.mockReturnValue({ account, loading: false, error: null, reload: vi.fn() });
  useAccountMovementsMock.mockReturnValue({ movements, totals, loading, error: null, reload: vi.fn() });
  useBankStatementsMock.mockReturnValue({ statements, loading: false, error: null, reload: vi.fn() });
  useReconciliationsMock.mockReturnValue({ reconciliations, loading: false });
}

describe('FinancialAccountWindow', () => {
  beforeEach(() => {
    setMetaMock.mockClear();
    toastFn.mockClear();
    toastSuccessFn.mockClear();
    toastErrorFn.mockClear();
    exportCsvMock.mockClear();
    mockStatementsApi = { selected: [], filtered: [] };
    useFinancialAccountMock.mockReset();
    useAccountMovementsMock.mockReset();
    useBankStatementsMock.mockReset();
    useReconciliationsMock.mockReset();
  });

  it('passes the recordId to all three data hooks', () => {
    setHooks();
    render(<FinancialAccountWindow recordId="acc-1" />);
    expect(useFinancialAccountMock).toHaveBeenCalledWith('acc-1');
    expect(useAccountMovementsMock).toHaveBeenCalledWith('acc-1');
    expect(useBankStatementsMock).toHaveBeenCalledWith('acc-1');
  });

  it('mounts the movements tab by default and passes account + movements + loading through', () => {
    setHooks({
      account: { id: 'acc-1', name: 'BBVA' },
      movements: [{ id: 'm1' }, { id: 'm2' }],
      loading: true,
    });
    render(<FinancialAccountWindow recordId="acc-1" />);

    expect(screen.getByTestId('tab-movements')).toBeInTheDocument();
    expect(screen.getByTestId('tab-movements-count').textContent).toBe('2');
    expect(screen.getByTestId('tab-movements-loading').textContent).toBe('true');
    expect(screen.getByTestId('tab-movements-account').textContent).toBe('BBVA');

    expect(screen.queryByTestId('tab-reconciliation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-statements')).not.toBeInTheDocument();
  });

  it('switches to the reconciliation tab when its trigger is clicked', () => {
    setHooks();
    render(<FinancialAccountWindow recordId="acc-1" />);

    // The DetailTabs component renders three tab buttons; find by their i18n keys.
    fireEvent.click(screen.getByText('financeAccountDetailTabReconciliation'));
    expect(screen.getByTestId('tab-reconciliation')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-movements')).not.toBeInTheDocument();
  });

  it('switches to the statements tab when its trigger is clicked', () => {
    setHooks();
    render(<FinancialAccountWindow recordId="acc-1" />);

    fireEvent.click(screen.getByText('financeAccountDetailTabStatements'));
    expect(screen.getByTestId('tab-statements')).toBeInTheDocument();
  });

  it('replaces Export with a clickable-looking Automatch button on the reconciliation tab', () => {
    setHooks();
    render(<FinancialAccountWindow recordId="acc-1" />);

    fireEvent.click(screen.getByText('financeAccountDetailTabReconciliation'));

    expect(screen.queryByTestId('financial-account-export')).not.toBeInTheDocument();
    expect(screen.getByTestId('financial-account-automatch')).toBeEnabled();
    expect(exportCsvMock).not.toHaveBeenCalled();
  });

  it('shows an error toast when exporting an empty movements list', () => {
    setHooks({ movements: [] });
    render(<FinancialAccountWindow recordId="acc-1" />);

    fireEvent.click(screen.getByText('financeAccountDetailExport'));

    expect(toastErrorFn).toHaveBeenCalledWith('financeAccountDetailExportEmpty');
    expect(exportCsvMock).not.toHaveBeenCalled();
  });

  it('exports movements through the generic backend CSV flow with filtered ids', async () => {
    setHooks({
      account: { id: 'acc-1', name: 'BBVA' },
      movements: [{ id: 'm1' }, { id: 'm2' }],
    });
    render(<FinancialAccountWindow recordId="acc-1" />);

    fireEvent.click(screen.getByText('financeAccountDetailExport'));

    await waitFor(() => expect(exportCsvMock).toHaveBeenCalledTimes(1));
    const opts = exportCsvMock.mock.calls[0][0];
    expect(opts.path).toBe('/sws/neo/financial-account-transactions');
    expect(opts.params.FIN_Financial_Account_ID).toBe('acc-1');
    expect(opts.params.ids).toBe('m1,m2');
    expect(opts.params.columns).toContain('transactionTypeLabel:Transaction Type');
    expect(opts.params.columns).toContain('depositAmount:Deposit Amount');
    expect(opts.filename).toBe('BBVA_movements');
    expect(toastSuccessFn).toHaveBeenCalledWith('financeAccountDetailExportDone');
  });

  it('exports the filtered statement HEADERS when no statement is selected', async () => {
    setHooks({ account: { id: 'acc-1', name: 'BBVA' }, statements: [{ id: 's1' }, { id: 's2' }] });
    mockStatementsApi = { selected: [], filtered: [{ id: 's1' }, { id: 's2' }] };
    render(<FinancialAccountWindow recordId="acc-1" />);

    fireEvent.click(screen.getByText('financeAccountDetailTabStatements'));
    fireEvent.click(screen.getByText('financeAccountDetailExport'));

    await waitFor(() => expect(exportCsvMock).toHaveBeenCalledTimes(1));
    const opts = exportCsvMock.mock.calls[0][0];
    expect(opts.path).toBe('/sws/neo/bank-statements');
    expect(opts.params.FIN_Financial_Account_ID).toBe('acc-1');
    expect(opts.params.ids).toBe('s1,s2');
    expect(opts.params.action).toBeUndefined();
    expect(opts.params.columns).toContain('documentNo:Document No.');
    expect(opts.filename).toBe('BBVA_statements');
    expect(toastSuccessFn).toHaveBeenCalledWith('financeAccountDetailExportDone');
  });

  it('exports the LINES of the selected statement(s) when there is a selection', async () => {
    setHooks({ account: { id: 'acc-1', name: 'BBVA' }, statements: [{ id: 's1' }, { id: 's2' }] });
    mockStatementsApi = { selected: ['s1', 's2'], filtered: [{ id: 's1' }, { id: 's2' }] };
    render(<FinancialAccountWindow recordId="acc-1" />);

    fireEvent.click(screen.getByText('financeAccountDetailTabStatements'));
    fireEvent.click(screen.getByText('financeAccountDetailExport'));

    await waitFor(() => expect(exportCsvMock).toHaveBeenCalledTimes(1));
    const opts = exportCsvMock.mock.calls[0][0];
    expect(opts.params.action).toBe('lines');
    expect(opts.params.statementIds).toBe('s1,s2');
    expect(opts.params.columns).toContain('lineNo:Line No.');
    expect(opts.filename).toBe('BBVA_lines');
    expect(toastSuccessFn).toHaveBeenCalledWith('financeAccountDetailExportDone');
  });

  it('shows the empty toast when exporting headers with no filtered statements', async () => {
    setHooks({ account: { id: 'acc-1', name: 'BBVA' }, statements: [] });
    mockStatementsApi = { selected: [], filtered: [] };
    render(<FinancialAccountWindow recordId="acc-1" />);

    fireEvent.click(screen.getByText('financeAccountDetailTabStatements'));
    fireEvent.click(screen.getByText('financeAccountDetailExport'));

    await waitFor(() => expect(toastErrorFn).toHaveBeenCalledWith('financeAccountDetailExportEmpty'));
    expect(exportCsvMock).not.toHaveBeenCalled();
  });

  it('calls useSetPageMeta with the account name in the breadcrumb', () => {
    setHooks({ account: { id: 'acc-1', name: 'BBVA' } });
    render(<FinancialAccountWindow recordId="acc-1" />);

    expect(setMetaMock).toHaveBeenCalled();
    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.title).toBe('BBVA');
    expect(lastCall.breadcrumb).toContain('BBVA');
  });

  it('uses an empty account name when account is null (no crash)', () => {
    setHooks({ account: null });
    render(<FinancialAccountWindow recordId="acc-1" />);
    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.title).toBe('');
  });

  it('passes the pendingCount through DetailTabs as the reconciliation count badge', () => {
    setHooks({
      account: { id: 'acc-1', name: 'BBVA', pendingCount: 9 },
      movements: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    });
    render(<FinancialAccountWindow recordId="acc-1" />);
    // DetailTabs renders a "9" badge next to the reconciliation trigger.
    // (The movements count badge "3" can collide with the stubbed tab content,
    // so we only assert on the unambiguous reconciliation badge here.)
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('badges the reconciliations tab with the document count on a cash account', () => {
    setHooks({
      account: { id: 'acc-1', name: 'Caja', type: 'C', pendingCount: 0 },
      reconciliations: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }, { id: 'r5' }],
    });
    render(<FinancialAccountWindow recordId="acc-1" />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('leaves the reconciliations query idle on a non-cash account', () => {
    setHooks({ account: { id: 'acc-1', name: 'BBVA', type: 'B', pendingCount: 0 } });
    render(<FinancialAccountWindow recordId="acc-1" />);
    // The tab is hidden for bank accounts, so the hook must be parked with a null id rather than
    // fetching a list nothing will ever render.
    expect(useReconciliationsMock).toHaveBeenCalledWith(null);
  });

  it('renders the statements tab trigger without a numeric badge', () => {
    setHooks({
      account: { id: 'acc-1', name: 'BBVA', pendingCount: 0 },
      statements: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }, { id: 's6' }, { id: 's7' }],
    });
    render(<FinancialAccountWindow recordId="acc-1" />);
    // The statements trigger renders, but DetailTabs no longer shows a count badge
    // for it — so the statements count (7) must not appear anywhere.
    expect(screen.getByText('financeAccountDetailTabStatements')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });
});
