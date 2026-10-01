/**
 * ETP-5522 regression — creating / importing / syncing / processing / deleting a bank statement
 * from the account detail must mark the shared `account` cache entries stale, so the Cuentas list
 * (useEntity('account'), 30s staleTime) does not keep showing the old reconciliation badge when
 * the user goes back. Merely mounting the tab or navigating inside it must NOT invalidate.
 *
 * The shared data cache is replaced through `useOptionalDataCache` (the original module is
 * spread) so the assertion is on the exact pattern handed to `cache.invalidate`. Every heavy child
 * is stubbed down to the callbacks the tab hands it — same approach as ImportedStatementsTab.vitest.jsx.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const invalidateMock = vi.fn();
// Stable object: the hook memoizes on `cache`, so a new object per render would hide bugs.
const dataCacheValue = { cache: { invalidate: (...a) => invalidateMock(...a) } };
vi.mock('@etendosoftware/app-shell-core/data', async (importOriginal) => ({
  ...(await importOriginal()),
  useOptionalDataCache: () => dataCacheValue,
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const processStatement = vi.fn();
const reactivateStatement = vi.fn();
const deleteStatement = vi.fn();
vi.mock('@/hooks/useStatementActions', () => ({
  useStatementActions: () => ({
    processStatement, reactivateStatement, deleteStatement, updateStatement: vi.fn(),
    busy: false, error: null,
  }),
}));

const bankSync = vi.fn();
vi.mock('@/hooks/useBankConnectionActions', () => ({
  useBankConnectionActions: () => ({ sync: bankSync }),
}));

vi.mock('../StatementConfirmDialog', () => ({
  StatementConfirmDialog: (props) => (props.variant ? (
    <div data-testid="stub-confirm" data-variant={props.variant}>
      <button type="button" data-testid="confirm-run" onClick={props.onConfirm} />
    </div>
  ) : null),
}));

const reloadFn = vi.fn();
const NOW = new Date();
function isoDaysAgo(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
const STATEMENTS = [
  { id: 's1', documentNo: 'BS-001', fileName: 'mayo.c43', name: 'Mayo', importDate: isoDaysAgo(2), status: 'PENDING' },
  { id: 's4', documentNo: 'BS-004', fileName: 'borrador.c43', name: 'Borrador', importDate: isoDaysAgo(10), status: 'DRAFT' },
];
vi.mock('@/hooks/useBankStatements', () => ({
  useBankStatements: () => ({ statements: STATEMENTS, loading: false, reload: reloadFn }),
}));

vi.mock('../StatementsToolbar', () => ({
  StatementsToolbar: ({ onSearchChange, onStatusChange, onImportClick, onManualClick, onSyncClick }) => (
    <div data-testid="stub-toolbar">
      <button type="button" data-testid="toolbar-search" onClick={() => onSearchChange('mayo')} />
      <button type="button" data-testid="toolbar-status" onClick={() => onStatusChange('PENDING')} />
      <button type="button" data-testid="toolbar-import" onClick={onImportClick} />
      <button type="button" data-testid="toolbar-manual" onClick={onManualClick} />
      <button type="button" data-testid="toolbar-sync" onClick={onSyncClick} />
    </div>
  ),
}));

vi.mock('../StatementsTable', () => ({
  StatementsTable: ({ statements, actions }) => (
    <div data-testid="stub-table">
      {statements.map((s) => (
        <div key={s.id}>
          <button type="button" data-testid={`row-edit-${s.id}`} onClick={() => actions?.onEdit(s)} />
          <button type="button" data-testid={`row-process-${s.id}`} onClick={() => actions?.onProcess(s)} />
          <button type="button" data-testid={`row-delete-${s.id}`} onClick={() => actions?.onDelete(s)} />
        </div>
      ))}
    </div>
  ),
  buildStatementSortAccessors: () => ({}),
  buildStatementSortColumns: () => [],
}));

vi.mock('../StatementLinesView', () => ({
  StatementLinesView: () => <div data-testid="stub-lines-view" />,
}));

vi.mock('../ImportStatementModal', () => ({
  ImportStatementModal: ({ onClose, onSuccess }) => (
    <div data-testid="stub-import-modal">
      <button type="button" data-testid="import-close" onClick={onClose} />
      <button type="button" data-testid="import-success" onClick={onSuccess} />
    </div>
  ),
}));

vi.mock('../ManualStatementModal', () => ({
  ManualStatementModal: ({ onClose, onSuccess }) => (
    <div data-testid="stub-manual-modal">
      <button type="button" data-testid="manual-close" onClick={onClose} />
      <button type="button" data-testid="manual-success" onClick={onSuccess} />
    </div>
  ),
}));

import { ImportedStatementsTab } from '../ImportedStatementsTab.jsx';

const ACCOUNT = { id: 'acc-1', currencyIso: 'EUR' };
const BANK_ACCOUNT = { id: 'acc-1', currencyIso: 'EUR', bankConnected: true };

describe('ImportedStatementsTab — account list cache invalidation (ETP-5522)', () => {
  beforeEach(() => {
    invalidateMock.mockReset();
    reloadFn.mockReset();
    processStatement.mockReset();
    reactivateStatement.mockReset();
    deleteStatement.mockReset();
    bankSync.mockReset();
    bankSync.mockResolvedValue({ status: 'OK', message: 'done' });
  });

  describe('CA2 — no invalidation without a mutation', () => {
    it('does not invalidate on initial mount', () => {
      render(<ImportedStatementsTab account={ACCOUNT} />);
      expect(screen.getByTestId('stub-table')).toBeInTheDocument();
      expect(invalidateMock).not.toHaveBeenCalled();
    });

    it('does not invalidate while filtering or opening/closing the modals without saving', async () => {
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('toolbar-search'));
      await user.click(screen.getByTestId('toolbar-status'));
      await user.click(screen.getByTestId('toolbar-manual'));
      await user.click(screen.getByTestId('manual-close'));
      await user.click(screen.getByTestId('toolbar-import'));
      await user.click(screen.getByTestId('import-close'));

      expect(invalidateMock).not.toHaveBeenCalled();
    });

    it('does not invalidate when a confirmed action fails on the backend', async () => {
      processStatement.mockRejectedValueOnce(new Error('boom'));
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('row-process-s1'));
      await user.click(screen.getByTestId('confirm-run'));

      await waitFor(() => expect(processStatement).toHaveBeenCalledWith('s1'));
      expect(reloadFn).not.toHaveBeenCalled();
      expect(invalidateMock).not.toHaveBeenCalled();
    });
  });

  describe('CA1 — a successful statement mutation invalidates the account list', () => {
    it('after a manual statement is created', async () => {
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('toolbar-manual'));
      await user.click(screen.getByTestId('manual-success'));

      expect(invalidateMock).toHaveBeenCalledWith({ entity: 'account' });
      expect(reloadFn).toHaveBeenCalledTimes(1);
    });

    it('after a statement is edited through the manual modal', async () => {
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('row-edit-s4'));
      await user.click(screen.getByTestId('manual-success'));

      expect(invalidateMock).toHaveBeenCalledWith({ entity: 'account' });
    });

    it('after a statement file is imported', async () => {
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('toolbar-import'));
      await user.click(screen.getByTestId('import-success'));

      expect(invalidateMock).toHaveBeenCalledWith({ entity: 'account' });
    });

    it('after a PSD2 bank sync', async () => {
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={BANK_ACCOUNT} />);

      await user.click(screen.getByTestId('toolbar-sync'));

      await waitFor(() => expect(bankSync).toHaveBeenCalledWith('acc-1'));
      await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith({ entity: 'account' }));
    });

    it('after a statement is processed', async () => {
      processStatement.mockResolvedValueOnce({ id: 's1', processed: true });
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('row-process-s1'));
      await user.click(screen.getByTestId('confirm-run'));

      await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith({ entity: 'account' }));
    });

    it('after a statement is deleted', async () => {
      deleteStatement.mockResolvedValueOnce({});
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('row-delete-s4'));
      await user.click(screen.getByTestId('confirm-run'));

      await waitFor(() => expect(deleteStatement).toHaveBeenCalledWith('s4'));
      await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith({ entity: 'account' }));
    });
  });
});
