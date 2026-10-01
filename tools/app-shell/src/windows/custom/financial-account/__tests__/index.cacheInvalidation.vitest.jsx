/**
 * ETP-5522 regression — FinancialAccountDetail success paths must mark the shared `account` cache
 * entries stale, so the Cuentas list (useEntity('account'), 30s staleTime) is re-read on the way
 * back instead of serving a stale reconciliation badge. Mounting the detail, switching tabs and
 * opening/closing modals must NOT invalidate.
 *
 * Same stubbing approach as index.interactions.vitest.jsx: every child is reduced to the callbacks
 * index.jsx hands it, and the shared cache is replaced via `useOptionalDataCache` (original module
 * spread) so the assertion is on the exact pattern handed to `cache.invalidate`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';

const invalidateMock = vi.fn();
// Stable object across renders — the hook memoizes on `cache`.
const dataCacheValue = { cache: { invalidate: (...a) => invalidateMock(...a) } };
vi.mock('@etendosoftware/app-shell-core/data', async (importOriginal) => ({
  ...(await importOriginal()),
  useOptionalDataCache: () => dataCacheValue,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useParams: () => ({ recordId: 'acc-1' }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: () => 'full',
  WindowAccessGuard: () => <div data-testid="window-access-guard" />,
}));

const BANK_ACCOUNT = { id: 'acc-1', name: 'BBVA', type: 'B', pendingCount: 2 };
const CASH_ACCOUNT = { id: 'acc-1', name: 'Caja', type: 'C', pendingCount: 0 };
let currentAccount = BANK_ACCOUNT;
const reloadAccountMock = vi.fn();
vi.mock('@/hooks/useFinancialAccount', () => ({
  useFinancialAccount: () => ({
    account: currentAccount, loading: false, error: null, reload: reloadAccountMock,
  }),
}));
vi.mock('@/hooks/useReconciliationList', () => ({
  useReconciliations: () => ({ reconciliations: [], loading: false, reload: vi.fn() }),
  useClearedItems: () => ({ items: [], loading: false }),
}));
const reloadMovementsMock = vi.fn();
vi.mock('@/hooks/useAccountMovements', () => ({
  useAccountMovements: () => ({
    movements: [{ id: 'm1' }],
    totals: { balance: 0, currency: 'EUR' },
    loading: false,
    error: null,
    reload: reloadMovementsMock,
  }),
}));
vi.mock('@/hooks/useBankStatements', () => ({
  useBankStatements: () => ({ statements: [{ id: 's1' }], loading: false, reload: vi.fn() }),
}));
vi.mock('@/hooks/useReconciliation', () => ({
  useAutoMatch: () => ({ groups: [], kpis: {}, loading: false, error: null, reload: vi.fn() }),
}));
vi.mock('@/hooks/useCsvExport', () => ({
  useCsvExport: () => vi.fn(() => Promise.resolve()),
}));

let bankFlowOptions = null;
vi.mock('@/hooks/useBankConnectionFlow', () => ({
  useBankConnectionFlow: (opts) => {
    bankFlowOptions = opts;
    return {
      startConnect: vi.fn(),
      startCreate: vi.fn(),
      connecting: false,
      selection: null,
      confirmSelection: vi.fn(),
      cancelSelection: vi.fn(),
    };
  },
}));

vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

let movementsTabProps = null;
vi.mock('../MovementsTab.jsx', () => ({
  MovementsTab: forwardRef(function MovementsTabStub(props, ref) {
    movementsTabProps = props;
    useImperativeHandle(ref, () => ({ getFilteredMovements: () => [] }));
    return <div data-testid="tab-movements" />;
  }),
}));

vi.mock('../ReconciliationTab.jsx', () => ({
  ReconciliationTab: ({ onReconcileSuccess }) => (
    <div data-testid="tab-reconciliation">
      <button type="button" data-testid="stub-reconcile-success" onClick={onReconcileSuccess} />
    </div>
  ),
}));

vi.mock('../CashClose/index.jsx', () => ({
  CashCloseTab: ({ onCloseSuccess }) => (
    <button type="button" data-testid="stub-cash-close-success" onClick={() => onCloseSuccess?.()} />
  ),
}));

vi.mock('../ImportedStatementsTab.jsx', () => ({
  ImportedStatementsTab: forwardRef(function ImportedStatementsTabStub(_props, ref) {
    useImperativeHandle(ref, () => ({
      getSelectedStatementIds: () => [],
      getFilteredStatements: () => [],
    }));
    return <div data-testid="tab-statements" />;
  }),
}));

vi.mock('../EditAccountModal.jsx', () => ({
  EditAccountModal: ({ onClose, onSaved }) => (
    <div data-testid="edit-modal">
      <button type="button" data-testid="stub-edit-close" onClick={onClose} />
      <button type="button" data-testid="stub-edit-saved" onClick={onSaved} />
    </div>
  ),
}));

vi.mock('../ArchiveAccountDialog.jsx', () => ({
  ArchiveAccountDialog: () => <div data-testid="archive-dialog" />,
}));

vi.mock('../DeleteAccountDialog.jsx', () => ({
  DeleteAccountDialog: () => <div data-testid="delete-dialog" />,
}));

vi.mock('../BankConnectionFlowUI.jsx', () => ({
  BankConnectionFlowUI: () => <div data-testid="bank-connection-flow" />,
}));

vi.mock('@/components/contract-ui/AutoMatchSuggestionModal', () => ({
  AutoMatchSuggestionModal: ({ onClose, onSuccess }) => (
    <div data-testid="automatch-modal">
      <button type="button" data-testid="stub-automatch-close" onClick={onClose} />
      <button type="button" data-testid="stub-automatch-success" onClick={onSuccess} />
    </div>
  ),
}));

import { FinancialAccountDetail } from '../index.jsx';

const ACCOUNT_PATTERN = { entity: 'account' };

beforeEach(() => {
  currentAccount = BANK_ACCOUNT;
  bankFlowOptions = null;
  movementsTabProps = null;
  invalidateMock.mockReset();
  reloadAccountMock.mockReset();
  reloadMovementsMock.mockReset();
});

describe('FinancialAccountDetail — account list cache invalidation (ETP-5522)', () => {
  describe('CA2 — no invalidation without a mutation', () => {
    it('does not invalidate on mount', () => {
      render(<FinancialAccountDetail recordId="acc-1" />);
      expect(screen.getByTestId('tab-movements')).toBeInTheDocument();
      expect(invalidateMock).not.toHaveBeenCalled();
    });

    it('does not invalidate when switching tabs or closing modals without saving', () => {
      render(<FinancialAccountDetail recordId="acc-1" />);

      fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));
      fireEvent.click(screen.getByTestId('detail-tab-statements'));
      fireEvent.click(screen.getByTestId('stub-automatch-close'));
      fireEvent.click(screen.getByTestId('stub-edit-close'));

      expect(invalidateMock).not.toHaveBeenCalled();
    });
  });

  describe('CA3 — detail success paths invalidate the account list', () => {
    it('after a manual reconcile (onReconcileSuccess)', () => {
      render(<FinancialAccountDetail recordId="acc-1" />);
      fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));

      fireEvent.click(screen.getByTestId('stub-reconcile-success'));

      expect(invalidateMock).toHaveBeenCalledWith(ACCOUNT_PATTERN);
      expect(reloadAccountMock).toHaveBeenCalled();
    });

    it('after a successful automatch apply', () => {
      render(<FinancialAccountDetail recordId="acc-1" />);

      fireEvent.click(screen.getByTestId('stub-automatch-success'));

      expect(invalidateMock).toHaveBeenCalledWith(ACCOUNT_PATTERN);
    });

    it('after a confirmed cash close (onCloseSuccess)', () => {
      currentAccount = CASH_ACCOUNT;
      render(<FinancialAccountDetail recordId="acc-1" />);
      fireEvent.click(screen.getByTestId('detail-tab-reconciliation'));

      fireEvent.click(screen.getByTestId('stub-cash-close-success'));

      expect(invalidateMock).toHaveBeenCalledWith(ACCOUNT_PATTERN);
    });

    it('when the bank connect flow finishes (onDone)', () => {
      render(<FinancialAccountDetail recordId="acc-1" />);

      bankFlowOptions.onDone();

      expect(invalidateMock).toHaveBeenCalledWith(ACCOUNT_PATTERN);
      expect(reloadAccountMock).toHaveBeenCalled();
    });

    it('after a movement mutation (MovementsTab onReload)', () => {
      render(<FinancialAccountDetail recordId="acc-1" />);

      movementsTabProps.onReload();

      expect(invalidateMock).toHaveBeenCalledWith(ACCOUNT_PATTERN);
      expect(reloadMovementsMock).toHaveBeenCalled();
    });

    it('after the account is edited and saved', () => {
      render(<FinancialAccountDetail recordId="acc-1" />);

      fireEvent.click(screen.getByTestId('stub-edit-saved'));

      expect(invalidateMock).toHaveBeenCalledWith(ACCOUNT_PATTERN);
    });
  });
});
