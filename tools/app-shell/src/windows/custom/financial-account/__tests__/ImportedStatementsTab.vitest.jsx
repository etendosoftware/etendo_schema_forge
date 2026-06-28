import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
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

// usePsd2Actions calls useAuth internally; stub it so no AuthProvider is needed.
const psd2Sync = vi.fn();
vi.mock('@/hooks/usePsd2Actions', () => ({
  usePsd2Actions: () => ({ sync: psd2Sync }),
}));

// Capture the confirm dialog props so we can assert which action was requested.
const confirmProps = { value: null };
vi.mock('../StatementConfirmDialog', () => ({
  StatementConfirmDialog: (props) => {
    confirmProps.value = props;
    return props.variant ? (
      <div data-testid="stub-confirm" data-variant={props.variant}>
        <button type="button" data-testid="confirm-run" onClick={props.onConfirm} />
        <button type="button" data-testid="confirm-close" onClick={props.onClose} />
      </div>
    ) : null;
  },
}));

// Stub all heavy children — each has its own test suite. We assert wiring at
// this level: what's mounted in each branch of the state machine, and that
// props flow correctly.
const statementsRef = { value: [] };
const loadingRef = { value: false };
const reloadFn = vi.fn();
vi.mock('@/hooks/useBankStatements', () => ({
  useBankStatements: (accountId) => ({
    statements: statementsRef.value,
    loading: loadingRef.value,
    reload: reloadFn,
    _accountId: accountId, // exposed for one assertion
  }),
}));

vi.mock('../StatementsToolbar', () => ({
  StatementsToolbar: ({
    search, onSearchChange, dateRange, onDateRangeChange,
    status, onStatusChange, onAdvancedFilterChange, onImportClick, onManualClick,
    psd2Synced, onSyncClick, syncing,
  }) => (
    <div
      data-testid="stub-toolbar"
      data-search={search}
      data-status={status ?? ''}
      data-psd2-synced={psd2Synced ? 'true' : 'false'}
      data-syncing={syncing ? 'true' : 'false'}
    >
      <button type="button" data-testid="toolbar-search" onClick={() => onSearchChange('mayo')} />
      <button type="button" data-testid="toolbar-status" onClick={() => onStatusChange('PARTIAL')} />
      <button type="button" data-testid="toolbar-daterange" onClick={() => onDateRangeChange({ presetId: 'last7' })} />
      <button
        type="button"
        data-testid="toolbar-advanced"
        onClick={() => onAdvancedFilterChange({
          rowOperator: 'and',
          conditions: [{ field: 'status', operator: 'equals', value: 'RECONCILED' }],
        })}
      />
      <button type="button" data-testid="toolbar-import" onClick={onImportClick} />
      <button type="button" data-testid="toolbar-manual" onClick={onManualClick} />
      <button type="button" data-testid="toolbar-sync" onClick={onSyncClick} />
    </div>
  ),
}));

vi.mock('../StatementsTable', () => ({
  StatementsTable: ({ statements, loading, currency, actions, selectedIds, onSelectionChange }) => (
    <div
      data-testid="stub-table"
      data-len={statements.length}
      data-loading={loading ? 'true' : 'false'}
      data-currency={currency}
      data-has-actions={actions ? 'true' : 'false'}
      data-selected={selectedIds ? Array.from(selectedIds).join(',') : ''}
    >
      {statements.map((s) => (
        <div key={s.id}>
          <button type="button" data-testid={`row-${s.id}`} onClick={() => s.__select?.()}>
            {s.documentNo}
          </button>
          <button
            type="button"
            data-testid={`row-select-${s.id}`}
            onClick={() => onSelectionChange?.(s.id)}
          />
          <button type="button" data-testid={`row-edit-${s.id}`} onClick={() => actions?.onEdit(s)} />
          <button type="button" data-testid={`row-process-${s.id}`} onClick={() => actions?.onProcess(s)} />
          <button type="button" data-testid={`row-reactivate-${s.id}`} onClick={() => actions?.onReactivate(s)} />
          <button type="button" data-testid={`row-delete-${s.id}`} onClick={() => actions?.onDelete(s)} />
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../StatementLinesView', () => ({
  StatementLinesView: ({ statementId, statementName, currency, onBack }) => (
    <div
      data-testid="stub-lines-view"
      data-id={statementId}
      data-name={statementName}
      data-currency={currency}
    >
      <button type="button" data-testid="lines-view-back" onClick={onBack} />
    </div>
  ),
}));

vi.mock('../ImportStatementModal', () => ({
  ImportStatementModal: ({ open, accountId, accountCurrency, onClose, onSuccess }) => (
    <div
      data-testid="stub-import-modal"
      data-open={open ? 'true' : 'false'}
      data-account={accountId ?? ''}
      data-currency={accountCurrency}
    >
      <button type="button" data-testid="import-close" onClick={onClose} />
      <button type="button" data-testid="import-success" onClick={onSuccess} />
    </div>
  ),
}));

vi.mock('../ManualStatementModal', () => ({
  ManualStatementModal: ({ open, accountId, accountCurrency, statement, onClose, onSuccess }) => (
    <div
      data-testid="stub-manual-modal"
      data-open={open ? 'true' : 'false'}
      data-account={accountId ?? ''}
      data-currency={accountCurrency}
      data-statement={statement?.id ?? ''}
    >
      <button type="button" data-testid="manual-close" onClick={onClose} />
      <button type="button" data-testid="manual-success" onClick={onSuccess} />
    </div>
  ),
}));

import { ImportedStatementsTab } from '../ImportedStatementsTab.jsx';

const ACCOUNT = { id: 'acc-1', currencyIso: 'USD' };
const NOW = new Date();

function isoDaysAgo(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const STATEMENTS = [
  {
    id: 's1', documentNo: 'BS-001', fileName: 'mayo.c43', name: 'Mayo',
    importDate: isoDaysAgo(2),  status: 'PENDING',
  },
  {
    id: 's2', documentNo: 'BS-002', fileName: 'junio.c43', name: 'Junio',
    importDate: isoDaysAgo(20), status: 'PARTIAL',
  },
  {
    id: 's3', documentNo: 'BS-003', fileName: 'old.c43', name: 'Antiguo',
    // 25 days ago: still inside the default 30-day window (so row actions can
    // reach it) but outside last7 (so the date-filter test still drops it).
    importDate: isoDaysAgo(25), status: 'RECONCILED',
  },
];

describe('ImportedStatementsTab', () => {
  beforeEach(() => {
    statementsRef.value = STATEMENTS;
    loadingRef.value = false;
    reloadFn.mockReset();
    processStatement.mockReset();
    reactivateStatement.mockReset();
    deleteStatement.mockReset();
    psd2Sync.mockReset();
    psd2Sync.mockResolvedValue({ status: 'OK', message: 'done' });
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('forwards psd2Synced=false for a non-connected account', () => {
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(screen.getByTestId('stub-toolbar')).toHaveAttribute('data-psd2-synced', 'false');
  });

  it('forwards psd2Synced=true and syncs statements when the toolbar emits onSyncClick', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={{ id: 'acc-1', currencyIso: 'USD', psd2Connected: true }} />);
    expect(screen.getByTestId('stub-toolbar')).toHaveAttribute('data-psd2-synced', 'true');
    await user.click(screen.getByTestId('toolbar-sync'));
    await waitFor(() => expect(psd2Sync).toHaveBeenCalledWith('acc-1'));
    await waitFor(() => expect(reloadFn).toHaveBeenCalledTimes(1));
  });

  it('exposes the filtered headers and current selection via ref (for the export button)', async () => {
    const ref = { current: null };
    render(<ImportedStatementsTab ref={ref} account={ACCOUNT} />);

    // Default 30-day window keeps all three statements; none selected yet.
    expect(ref.current.getFilteredStatements().map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(ref.current.getSelectedStatementIds()).toEqual([]);

    await userEvent.click(screen.getByTestId('row-select-s2'));
    expect(ref.current.getSelectedStatementIds()).toEqual(['s2']);
  });

  it('renders the toolbar + table by default and forwards currency from the account', () => {
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(screen.getByTestId('stub-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('stub-table')).toBeInTheDocument();
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-currency', 'USD');
  });

  it('falls back to "EUR" when account has no currencyIso', () => {
    render(<ImportedStatementsTab account={{ id: 'acc-1' }} />);
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-currency', 'EUR');
  });

  it('forwards loading state from the hook', () => {
    loadingRef.value = true;
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-loading', 'true');
  });

  it('passes through all statements inside the default 30-day window', () => {
    render(<ImportedStatementsTab account={ACCOUNT} />);
    // All fixtures are <= 25 days old, so the default last-30 window keeps them.
    expect(screen.getByTestId('stub-table')).toHaveAttribute(
      'data-len', String(STATEMENTS.length),
    );
  });

  it('applies the last-30-days window by default, hiding older statements', () => {
    statementsRef.value = [
      ...STATEMENTS,
      { id: 's-old', documentNo: 'BS-OLD', fileName: 'viejo.c43', name: 'Muy antiguo',
        importDate: isoDaysAgo(400), status: 'RECONCILED' },
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    // The 400-day-old statement is dropped by the default window; the 3 recent ones stay.
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', String(STATEMENTS.length));
  });

  it('filters by status when the toolbar emits onStatusChange', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    await user.click(screen.getByTestId('toolbar-status'));
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', '1');
  });

  it('filters by date range when the toolbar emits a preset (last7 drops the 20- and 25-day-old rows)', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    await user.click(screen.getByTestId('toolbar-daterange'));
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', '1');
  });

  it('filters by search query (case-insensitive substring against fileName / name / documentNo)', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    // The stub fires onSearchChange('mayo') — only s1 (fileName=mayo.c43) matches.
    await user.click(screen.getByTestId('toolbar-search'));
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', '1');
  });

  it('opens the import modal when toolbar emits onImportClick', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(screen.getByTestId('stub-import-modal')).toHaveAttribute('data-open', 'false');
    await user.click(screen.getByTestId('toolbar-import'));
    expect(screen.getByTestId('stub-import-modal')).toHaveAttribute('data-open', 'true');
  });

  it('closes the import modal via the dialog close handler', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    await user.click(screen.getByTestId('toolbar-import'));
    await user.click(screen.getByTestId('import-close'));
    expect(screen.getByTestId('stub-import-modal')).toHaveAttribute('data-open', 'false');
  });

  it('triggers the hook reload when the modal reports success', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    await user.click(screen.getByTestId('toolbar-import'));
    await user.click(screen.getByTestId('import-success'));
    expect(reloadFn).toHaveBeenCalledTimes(1);
  });

  it('opens the manual-create modal when toolbar emits onManualClick', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(screen.getByTestId('stub-manual-modal')).toHaveAttribute('data-open', 'false');
    await user.click(screen.getByTestId('toolbar-manual'));
    expect(screen.getByTestId('stub-manual-modal')).toHaveAttribute('data-open', 'true');
  });

  it('reloads the list when the manual-create modal reports success', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    await user.click(screen.getByTestId('toolbar-manual'));
    await user.click(screen.getByTestId('manual-success'));
    expect(reloadFn).toHaveBeenCalledTimes(1);
  });

  it('passes accountId + currency through to the import modal', () => {
    render(<ImportedStatementsTab account={ACCOUNT} />);
    const modal = screen.getByTestId('stub-import-modal');
    expect(modal).toHaveAttribute('data-account', 'acc-1');
    expect(modal).toHaveAttribute('data-currency', 'USD');
  });

  it('passes accountId=null to the import modal when the account is null', () => {
    render(<ImportedStatementsTab account={null} />);
    expect(screen.getByTestId('stub-import-modal')).toHaveAttribute('data-account', '');
  });

  it('wires row actions through to the table', () => {
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-has-actions', 'true');
  });

  it('narrows the table when the advanced "by conditions" filter is applied', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', String(STATEMENTS.length));
    // The stub emits a status=RECONCILED condition — only s3 matches.
    await user.click(screen.getByTestId('toolbar-advanced'));
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', '1');
  });

  it('opens the manual modal in edit mode when a row requests Edit', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(screen.getByTestId('stub-manual-modal')).toHaveAttribute('data-statement', '');
    await user.click(screen.getByTestId('row-edit-s1'));
    const modal = screen.getByTestId('stub-manual-modal');
    expect(modal).toHaveAttribute('data-open', 'true');
    expect(modal).toHaveAttribute('data-statement', 's1');
  });

  it('confirms then processes a statement and reloads on success', async () => {
    processStatement.mockResolvedValueOnce({ id: 's2', processed: true });
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);

    await user.click(screen.getByTestId('row-process-s2'));
    expect(screen.getByTestId('stub-confirm')).toHaveAttribute('data-variant', 'process');

    await user.click(screen.getByTestId('confirm-run'));
    expect(processStatement).toHaveBeenCalledWith('s2');
    await waitFor(() => expect(reloadFn).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountStatementsProcessSuccess');
  });

  it('confirms then deletes a statement and reloads on success', async () => {
    deleteStatement.mockResolvedValueOnce({ id: 's3' });
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);

    await user.click(screen.getByTestId('row-delete-s3'));
    expect(screen.getByTestId('stub-confirm')).toHaveAttribute('data-variant', 'delete');

    await user.click(screen.getByTestId('confirm-run'));
    expect(deleteStatement).toHaveBeenCalledWith('s3');
    await waitFor(() => expect(reloadFn).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountStatementsDeleteSuccess');
  });

  it('confirms then reactivates a statement and reloads on success', async () => {
    reactivateStatement.mockResolvedValueOnce({ id: 's3', processed: false });
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);

    await user.click(screen.getByTestId('row-reactivate-s3'));
    expect(screen.getByTestId('stub-confirm')).toHaveAttribute('data-variant', 'reactivate');

    await user.click(screen.getByTestId('confirm-run'));
    expect(reactivateStatement).toHaveBeenCalledWith('s3');
    await waitFor(() => expect(reloadFn).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountStatementsReactivateSuccess');
  });

  it('surfaces an error toast and keeps the dialog open when the action fails', async () => {
    deleteStatement.mockRejectedValueOnce(new Error('HTTP 400'));
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);

    await user.click(screen.getByTestId('row-delete-s1'));
    await user.click(screen.getByTestId('confirm-run'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('financeAccountStatementsDeleteError'));
    expect(reloadFn).not.toHaveBeenCalled();
  });
});
