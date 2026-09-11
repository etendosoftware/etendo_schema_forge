/**
 * FinancialAccountWindow — list/detail branch of the window entry point.
 *
 * ETP-4658 split this file in two: `FinancialAccountDetail` (the hand-written
 * Movimientos / Extractos / Conciliación tabs, covered by `index.vitest.jsx`) and a thin
 * default-export wrapper that picks the branch. The wrapper is what `registry.js` loads
 * for the `financial-account` window, so both branches are load-bearing:
 *
 *  - `recordId` present  → the hand-written detail;
 *  - `recordId` absent   → the GENERATED `AccountPage` (ListView + the AccountsHeaderTable
 *    slot), and it must receive `recordId === undefined`. If `recordId` leaked through,
 *    AccountPage's own `if (recordId)` branch would render the generic DetailView instead
 *    of our tabs — that is the whole reason the wrapper passes it explicitly.
 *
 * Both children are stubbed here so the assertions are about the branch decision and the
 * props crossing it, not about either child's internals.
 */
import { render, screen } from '@testing-library/react';

let accountPageProps = null;
vi.mock('@generated/financial-account/generated/web/financial-account/AccountPage', () => ({
  default: (props) => {
    accountPageProps = props;
    return <div data-testid="generated-account-page" />;
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useParams: () => ({}),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: () => 'full',
  WindowAccessGuard: () => <div data-testid="window-access-guard" />,
}));

// Detail-only dependency graph — stubbed so mounting the detail branch stays cheap.
vi.mock('@/hooks/useReconciliationList', () => ({
  // `reload` included on purpose: the real hook always returns one, and the account page calls
  // it as part of its full refresh. A mock missing it throws only once some path happens to
  // reach that call — which is how it stayed unnoticed until saving the edit modal did.
  useReconciliations: () => ({ reconciliations: [], loading: false, reload: vi.fn() }),
  useClearedItems: () => ({ items: [], loading: false }),
}));
vi.mock('@/hooks/useFinancialAccount', () => ({
  useFinancialAccount: () => ({ account: { id: 'acc-1', name: 'BBVA' }, reload: vi.fn() }),
}));
vi.mock('@/hooks/useAccountMovements', () => ({
  useAccountMovements: () => ({ movements: [], totals: {}, loading: false, reload: vi.fn() }),
}));
vi.mock('@/hooks/useBankStatements', () => ({
  useBankStatements: () => ({ statements: [], loading: false, reload: vi.fn() }),
}));
vi.mock('@/hooks/useCsvExport', () => ({ useCsvExport: () => vi.fn() }));
vi.mock('@/hooks/useBankConnectionFlow', () => ({
  useBankConnectionFlow: () => ({ startConnect: vi.fn(), startCreate: vi.fn() }),
}));
vi.mock('@/hooks/useReconciliation', () => ({
  useAutoMatch: () => ({ groups: [], kpis: {}, reload: vi.fn() }),
}));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));
vi.mock('../MovementsTab', () => ({ MovementsTab: () => <div data-testid="tab-movements" /> }));
vi.mock('../ReconciliationTab', () => ({ ReconciliationTab: () => <div data-testid="tab-reconciliation" /> }));
vi.mock('../ImportedStatementsTab', () => ({ ImportedStatementsTab: () => <div data-testid="tab-statements" /> }));
// `getVisibleTabs` is the real one on purpose: index.jsx derives its tab guard from it, so a stub
// returning the wrong shape would silently disable the guard this suite mounts through.
vi.mock('../DetailTabs', async (importOriginal) => ({
  ...(await importOriginal()),
  DetailTabs: () => <div data-testid="detail-tabs" />,
}));
vi.mock('../EditAccountModal.jsx', () => ({ EditAccountModal: () => <div data-testid="edit-modal" /> }));
vi.mock('../ArchiveAccountDialog.jsx', () => ({ ArchiveAccountDialog: () => <div data-testid="archive-dialog" /> }));
// ETP-4871 — a sibling of ArchiveAccountDialog, not a mode of it: index.jsx mounts it the same
// unconditional way. Without this stub the REAL component renders and its own
// `useAccountMutations()` call reaches the real (unmocked) `useAuth()`, throwing "useAuth must
// be used within AuthProvider" for every test in this file.
vi.mock('../DeleteAccountDialog.jsx', () => ({ DeleteAccountDialog: () => <div data-testid="delete-dialog" /> }));
vi.mock('../BankConnectionFlowUI.jsx', () => ({ BankConnectionFlowUI: () => <div data-testid="bank-connection-flow" /> }));
vi.mock('@/components/contract-ui/AutoMatchSuggestionModal', () => ({
  AutoMatchSuggestionModal: () => <div data-testid="automatch-modal" />,
}));

import FinancialAccountWindow, { FinancialAccountDetail } from '../index.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  accountPageProps = null;
});

describe('FinancialAccountWindow — branch selection', () => {
  it('renders the hand-written detail when a recordId is present', () => {
    render(<FinancialAccountWindow recordId="acc-1" />);

    expect(screen.getByTestId('detail-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('generated-account-page')).not.toBeInTheDocument();
  });

  it('renders the generated AccountPage when no recordId is present', () => {
    render(<FinancialAccountWindow windowName="financial-account" />);

    expect(screen.getByTestId('generated-account-page')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-tabs')).not.toBeInTheDocument();
  });

  it('renders the list branch for an empty-string recordId (no id in the route)', () => {
    render(<FinancialAccountWindow recordId="" />);

    expect(screen.getByTestId('generated-account-page')).toBeInTheDocument();
  });

  it('hands the generated page an undefined recordId so it takes its own list branch', () => {
    render(<FinancialAccountWindow windowName="financial-account" recordId={undefined} />);

    expect(accountPageProps).not.toBeNull();
    expect('recordId' in accountPageProps).toBe(true);
    expect(accountPageProps.recordId).toBeUndefined();
  });

  it('forwards every other prop to the generated page untouched', () => {
    render(
      <FinancialAccountWindow
        windowName="financial-account"
        apiBaseUrl="/sws/neo/financial-account-detail"
        token="tok"
      />,
    );

    expect(accountPageProps.windowName).toBe('financial-account');
    expect(accountPageProps.apiBaseUrl).toBe('/sws/neo/financial-account-detail');
    expect(accountPageProps.token).toBe('tok');
  });

  it('does not forward the wrapper\'s own props into the detail branch beyond recordId', () => {
    render(<FinancialAccountWindow recordId="acc-1" windowName="financial-account" />);

    // The detail is mounted with recordId only; nothing from the list branch leaks in.
    expect(screen.getByTestId('detail-tabs')).toBeInTheDocument();
    expect(accountPageProps).toBeNull();
  });

  it('still exports the detail component by name for direct mounting', () => {
    render(<FinancialAccountDetail recordId="acc-1" />);

    expect(screen.getByTestId('detail-tabs')).toBeInTheDocument();
  });
});
