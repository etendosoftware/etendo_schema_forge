import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// uiMock is a vi.fn() (not a plain arrow) so a single test below can override its
// implementation to prove the ETP-4891 translateBackendError wiring on the sync-result toast,
// while every other test keeps the default key-echoing behavior.
const uiMock = vi.fn((key) => key);
vi.mock('@/i18n', () => ({
  useUI: () => uiMock,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
    warning: (...a) => toastWarning(...a),
    info: (...a) => toastInfo(...a),
  },
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

// useBankConnectionActions calls useAuth internally; stub it so no AuthProvider is needed.
const bankSync = vi.fn();
vi.mock('@/hooks/useBankConnectionActions', () => ({
  useBankConnectionActions: () => ({ sync: bankSync }),
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
    bankConnectionSynced, onSyncClick, syncing, onRefresh,
  }) => (
    <div
      data-testid="stub-toolbar"
      data-search={search}
      data-status={status ?? ''}
      data-bank-connection-synced={bankConnectionSynced ? 'true' : 'false'}
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
      <button type="button" data-testid="toolbar-refresh" onClick={onRefresh} />
    </div>
  ),
}));

vi.mock('../StatementsTable', () => ({
  StatementsTable: ({
    statements, loading, currency, actions, selectedIds, onSelectionChange, linesRefreshToken,
    bankConnected,
  }) => (
    <div
      data-testid="stub-table"
      data-len={statements.length}
      data-loading={loading ? 'true' : 'false'}
      data-currency={currency}
      data-has-actions={actions ? 'true' : 'false'}
      data-selected={selectedIds ? Array.from(selectedIds).join(',') : ''}
      data-lines-token={String(linesRefreshToken)}
      data-bank-connected={bankConnected ? 'true' : 'false'}
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
  // The tab builds these from the table module (the sort state lives in the tab since
  // ETP-4921, so its toolbar can host the "Ordenar por" popover).
  buildStatementSortAccessors: () => ({}),
  buildStatementSortColumns: () => [],
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

// ETP-5111 — `resolveBulkDeleteBlock` is deliberately no longer exported (nor implemented): the
// tab no longer pre-computes a reason to disable the trash with. Its own describe block went with
// it; the replacement coverage is "the trigger is enabled and the backend explains the refusal".
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
  // ETP-4921 — the only two DRAFT fixtures, i.e. the only ones the bulk-delete trigger will
  // actually let through (see the `isDraftStatement` gate). Both older than 7 days (excluded
  // from the last7 test) and with fileName/name that never matches the 'mayo' search test.
  {
    id: 's4', documentNo: 'BS-004', fileName: 'borrador.c43', name: 'Borrador de julio',
    importDate: isoDaysAgo(10), status: 'DRAFT',
  },
  {
    id: 's5', documentNo: 'BS-005', fileName: 'borrador2.c43', name: 'Borrador de agosto',
    importDate: isoDaysAgo(11), status: 'DRAFT',
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
    bankSync.mockReset();
    bankSync.mockResolvedValue({ status: 'OK', message: 'done' });
    toastSuccess.mockReset();
    toastError.mockReset();
    toastWarning.mockReset();
    toastInfo.mockReset();
    uiMock.mockReset();
    uiMock.mockImplementation((key) => key);
  });

  it('forwards bankConnectionSynced=false for a non-connected account', () => {
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(screen.getByTestId('stub-toolbar')).toHaveAttribute('data-bank-connection-synced', 'false');
  });

  it('forwards bankConnectionSynced=true and syncs statements when the toolbar emits onSyncClick', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={{ id: 'acc-1', currencyIso: 'USD', bankConnected: true }} />);
    expect(screen.getByTestId('stub-toolbar')).toHaveAttribute('data-bank-connection-synced', 'true');
    await user.click(screen.getByTestId('toolbar-sync'));
    await waitFor(() => expect(bankSync).toHaveBeenCalledWith('acc-1'));
    await waitFor(() => expect(reloadFn).toHaveBeenCalledTimes(1));
  });

  // ETP-4891 follow-up: com.etendoerp.psd2's AD_MESSAGE for this toast has no real es_ES
  // translation (Core resolves the same English text regardless of session locale — see
  // backendErrors.js), so the raw sync-result message must be run through translateBackendError
  // before it reaches the toast, not passed straight through like an unmapped string.
  it('translates the "Transactions obtained" sync toast instead of showing the raw English', async () => {
    uiMock.mockImplementation((key, params) => (key === 'backendError.transactionsObtainedForAccount'
      ? `Movimientos obtenidos para la cuenta: ${params.account}.`
      : key));
    bankSync.mockResolvedValue({
      status: 'OK',
      message: 'Transactions obtained for the account: Cuenta pais españa .',
    });
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={{ id: 'acc-1', currencyIso: 'USD', bankConnected: true }} />);
    await user.click(screen.getByTestId('toolbar-sync'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(
      'Movimientos obtenidos para la cuenta: Cuenta pais españa.',
    ));
  });

  it('exposes the filtered headers and current selection via ref (for the export button)', async () => {
    const ref = { current: null };
    render(<ImportedStatementsTab ref={ref} account={ACCOUNT} />);

    // Default 30-day window keeps all five statements; none selected yet.
    expect(ref.current.getFilteredStatements().map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
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

  // ETP-4921 — this tab draws its own table instead of going through ListView, so it never
  // inherited ListView's refresh progress bar. It now renders the extracted ListProgressBar
  // under the same gate: only once rows are already on screen, because on the true first
  // fetch StatementsTable's own skeleton is the indicator.
  describe('refresh progress bar', () => {
    it('shows the bar while refreshing over statements already on screen', () => {
      loadingRef.value = true;
      render(<ImportedStatementsTab account={ACCOUNT} />);
      expect(screen.getByTestId('statements-progress-bar')).toBeInTheDocument();
    });

    it('keeps the rows mounted underneath the bar (smooth refresh, not a remount)', () => {
      loadingRef.value = true;
      render(<ImportedStatementsTab account={ACCOUNT} />);
      expect(screen.getByTestId('statements-progress-bar')).toBeInTheDocument();
      expect(screen.getByTestId('stub-table')).toHaveAttribute(
        'data-len', String(STATEMENTS.length),
      );
    });

    it('hides the bar on the very first fetch, where the table skeleton is the indicator', () => {
      statementsRef.value = [];
      loadingRef.value = true;
      render(<ImportedStatementsTab account={ACCOUNT} />);
      expect(screen.queryByTestId('statements-progress-bar')).not.toBeInTheDocument();
      expect(screen.getByTestId('stub-table')).toHaveAttribute('data-loading', 'true');
    });

    it('hides the bar once the fetch settles', () => {
      loadingRef.value = false;
      render(<ImportedStatementsTab account={ACCOUNT} />);
      expect(screen.queryByTestId('statements-progress-bar')).not.toBeInTheDocument();
    });

    it('uses its own testid so it never collides with another tab bar', () => {
      loadingRef.value = true;
      render(<ImportedStatementsTab account={ACCOUNT} />);
      expect(screen.queryByTestId('list-progress-bar')).not.toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBe(
        screen.getByTestId('statements-progress-bar'),
      );
    });
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

  // ── ETP-4656 (Gap 3) — bulk "Delete selected" over the existing checkbox
  // selection, via BulkDeleteSelectionBar + useBatchDeleteDialog (neither
  // mocked here — the real components render) ────────────────────────────
  describe('bulk delete selection bar', () => {
    // s1/s2/s3 are all non-draft (PENDING/PARTIAL/RECONCILED) — a real bulk-delete attempt on
    // them is exactly ETP-4921's reported bug, and is now blocked before it reaches the backend
    // (see the 'blocks a processed statement' describe below). So the outcome-toast scenarios
    // below use s4/s5, the two DRAFT fixtures, to exercise a delete that is actually allowed to
    // fire — a partial/total failure there is some OTHER reason (network, a race), which is
    // exactly the case the generic 3-outcome toast still needs to handle correctly.
    it('partial failure: reloads, fires ONE combined warning toast, and keeps only the failed statement selected', async () => {
      deleteStatement.mockImplementation((id) => (
        id === 's4' ? Promise.resolve() : Promise.reject(new Error('HTTP 400'))
      ));
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('row-select-s4'));
      await user.click(screen.getByTestId('row-select-s5'));
      expect(screen.getByTestId('stub-table')).toHaveAttribute('data-selected', 's4,s5');

      await user.click(screen.getByTestId('bulk-delete-selection-trigger'));
      await user.click(screen.getByTestId('batch-delete-confirm'));

      expect(deleteStatement).toHaveBeenCalledWith('s4');
      expect(deleteStatement).toHaveBeenCalledWith('s5');
      await waitFor(() => expect(toastWarning).toHaveBeenCalled());
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(toastError).not.toHaveBeenCalled();
      await waitFor(() => expect(reloadFn).toHaveBeenCalledTimes(1));
      // Only the failed statement (s5) remains selected; s4 (succeeded) was dropped.
      expect(screen.getByTestId('stub-table')).toHaveAttribute('data-selected', 's5');
    });

    it('all succeed: reloads and clears the selection entirely', async () => {
      deleteStatement.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('row-select-s4'));
      await user.click(screen.getByTestId('bulk-delete-selection-trigger'));
      await user.click(screen.getByTestId('batch-delete-confirm'));

      await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
      expect(toastWarning).not.toHaveBeenCalled();
      expect(toastError).not.toHaveBeenCalled();
      await waitFor(() => expect(reloadFn).toHaveBeenCalledTimes(1));
      // ETP-4972 — the bar now renders through SelectionToolbar (portaled), which
      // doesn't forward an arbitrary data-testid prop onto its DOM; assert via
      // the count span's own testid instead (see BulkDeleteSelectionBar.jsx).
      expect(screen.queryByTestId('bulk-delete-selection-count')).not.toBeInTheDocument();
    });

    it('all fail: does not reload, fires a single error toast, and leaves the bar showing the same selection', async () => {
      deleteStatement.mockRejectedValue(new Error('HTTP 400'));
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('row-select-s4'));
      await user.click(screen.getByTestId('bulk-delete-selection-trigger'));
      await user.click(screen.getByTestId('batch-delete-confirm'));

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(toastWarning).not.toHaveBeenCalled();
      expect(reloadFn).not.toHaveBeenCalled();
      expect(screen.getByTestId('bulk-delete-selection-count')).toBeInTheDocument();
      expect(screen.getByTestId('stub-table')).toHaveAttribute('data-selected', 's4');
    });

    /**
     * ETP-4921 pre-blocked the trash for a processed statement ("don't let them touch the trash
     * can"). ETP-5111 INVERTS that for all three surfaces of this window: the trigger is never
     * disabled by what the selection holds, the delete is attempted, and the backend's own 409
     * reason is what the user reads — spelled out for a single statement, counters-only above
     * that. The refusal itself is still enforced, just server-side (BankStatementsHandler
     * .requireDraft), which is the only place that can be authoritative about it.
     */
    describe('a processed statement is attempted, not pre-blocked', () => {
      const NOT_DRAFT = 'Only draft (unprocessed) statements can be modified';

      it('leaves the trigger enabled, with the plain delete label and no eligibility tooltip', async () => {
        const user = userEvent.setup();
        render(<ImportedStatementsTab account={ACCOUNT} />);

        // s1 is PENDING — processed, not a draft.
        await user.click(screen.getByTestId('row-select-s1'));

        const trigger = screen.getByTestId('bulk-delete-selection-trigger');
        expect(trigger).not.toBeDisabled();
        expect(trigger).toHaveAttribute('title', 'delete');
        expect(trigger).toHaveAttribute('aria-label', 'delete');
      });

      // The replacement for "never calls deleteStatement when the disabled trigger is clicked":
      // the call now DOES go out, and the reason reaches the user from the response. This is the
      // path `useStatementActions`' `error.status` exists for — `isBusinessRejection` only trusts
      // a 4xx, so without the status this would degrade to a bare counter even for one statement.
      it('attempts the delete and surfaces the backend reason for a single statement', async () => {
        uiMock.mockImplementation((key) => (key === 'backendError.statementNotDraft'
          ? 'Los extractos procesados no se pueden modificar'
          : key));
        const rejection = new Error(NOT_DRAFT);
        rejection.status = 400;
        deleteStatement.mockRejectedValue(rejection);

        const user = userEvent.setup();
        render(<ImportedStatementsTab account={ACCOUNT} />);

        await user.click(screen.getByTestId('row-select-s1'));
        await user.click(screen.getByTestId('bulk-delete-selection-trigger'));
        await user.click(screen.getByTestId('batch-delete-confirm'));

        expect(deleteStatement).toHaveBeenCalledWith('s1');
        await waitFor(() => expect(toastError).toHaveBeenCalledWith(
          'Los extractos procesados no se pueden modificar',
        ));
        // Neither the bare counter nor the untranslated English.
        expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining('bulkDelete'));
        expect(toastError).not.toHaveBeenCalledWith(NOT_DRAFT);
        // Nothing succeeded, so no refresh and the selection is kept for a retry.
        expect(reloadFn).not.toHaveBeenCalled();
        expect(screen.getByTestId('stub-table')).toHaveAttribute('data-selected', 's1');
      });

      it('stays enabled for a mixed processed + draft selection', async () => {
        const user = userEvent.setup();
        render(<ImportedStatementsTab account={ACCOUNT} />);

        await user.click(screen.getByTestId('row-select-s1'));
        await user.click(screen.getByTestId('row-select-s4'));
        expect(screen.getByTestId('bulk-delete-selection-trigger')).not.toBeDisabled();

        await user.click(screen.getByTestId('row-select-s1')); // deselect s1
        expect(screen.getByTestId('stub-table')).toHaveAttribute('data-selected', 's4');
        // Enabled before AND after — the selection's contents never gate this button.
        expect(screen.getByTestId('bulk-delete-selection-trigger')).not.toBeDisabled();
      });
    });
  });

  /**
   * ETP-4921 — `reload()` only refetches the statement HEADERS; the lines of an EXPANDED row come
   * from StatementLinesInline's own `useBankStatementLines(statementId)`, keyed solely on the id.
   * Nothing invalidated it, so after editing a line the header row showed the new total while the
   * rows underneath still showed the pre-edit amounts, and the toolbar's refresh button looked
   * broken (it reloaded exactly the half that was already correct). Every mutation path now bumps
   * a token that reaches the table.
   */
  describe('expanded rows are invalidated together with the headers', () => {
    const token = () => screen.getByTestId('stub-table').getAttribute('data-lines-token');

    it('starts at zero and bumps once the refresh button is used', async () => {
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);
      expect(token()).toBe('0');

      await user.click(screen.getByTestId('toolbar-refresh'));

      // Both halves refresh: the headers via reload(), the expanded lines via the token.
      expect(reloadFn).toHaveBeenCalledTimes(1);
      expect(token()).toBe('1');
    });

    it('bumps after a successful edit in the manual modal', async () => {
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('manual-success'));

      await waitFor(() => expect(token()).toBe('1'));
      expect(reloadFn).toHaveBeenCalledTimes(1);
    });

    it('bumps after a successful row action (process / reactivate / delete)', async () => {
      reactivateStatement.mockResolvedValueOnce({ id: 's3', processed: false });
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('row-reactivate-s3'));
      await user.click(screen.getByTestId('confirm-run'));

      await waitFor(() => expect(token()).toBe('1'));
    });

    // A failed action changes nothing on the server, so re-fetching would be noise.
    it('does not bump when the action fails', async () => {
      deleteStatement.mockRejectedValueOnce(new Error('Network request failed'));
      const user = userEvent.setup();
      render(<ImportedStatementsTab account={ACCOUNT} />);

      await user.click(screen.getByTestId('row-delete-s1'));
      await user.click(screen.getByTestId('confirm-run'));

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(token()).toBe('0');
      expect(reloadFn).not.toHaveBeenCalled();
    });
  });

  /**
   * ETP-4921 — a PSD2-connected account's statements come from the bank and must not be
   * hand-edited or deleted. The signal is ACCOUNT-level on purpose: nothing on the statement
   * records that it came from the bank (the PSD2 module only writes `fileName` from a translated
   * AD_MESSAGE, so its value depends on the language the sync ran in). Keying off the connection
   * is coherent with what this tab already does — it swaps "Importar / Nuevo extracto" for
   * "Sincronizar extractos", so a statement cannot be created by hand there either.
   */
  describe('bank-connected account is read-only', () => {
    const CONNECTED = { ...ACCOUNT, bankConnected: true };

    it('forwards the flag to the table so the row affordances disappear', () => {
      render(<ImportedStatementsTab account={CONNECTED} />);
      expect(screen.getByTestId('stub-table')).toHaveAttribute('data-bank-connected', 'true');
    });

    it('leaves it off for an account that is not connected', () => {
      render(<ImportedStatementsTab account={ACCOUNT} />);
      expect(screen.getByTestId('stub-table')).toHaveAttribute('data-bank-connected', 'false');
    });

    // ETP-5111 — the account-level PSD2 refusal moved to the BACKEND (BankStatementsHandler's new
    // 409 guard, which is where it can actually be enforced for every caller). The trash is no
    // longer greyed out here; a DRAFT of a connected account is attempted and refused with the
    // bank-connected reason. `bankConnectionSynced` itself survives — it still drives the toolbar
    // and the per-row affordances, which are out of scope.
    it('attempts the delete and surfaces the bank-connected reason instead of disabling the trash', async () => {
      const BANK_CONNECTED = 'Statements from a bank-connected account cannot be deleted.';
      uiMock.mockImplementation((key) => (
        key === 'backendError.statementBankConnectedNotDeletable'
          ? 'Los extractos de una cuenta conectada al banco no se pueden eliminar.'
          : key));
      const rejection = new Error(BANK_CONNECTED);
      rejection.status = 409;
      deleteStatement.mockRejectedValue(rejection);

      const user = userEvent.setup();
      render(<ImportedStatementsTab account={CONNECTED} />);

      await user.click(screen.getByTestId('row-select-s4')); // s4 is a draft
      const trigger = screen.getByTestId('bulk-delete-selection-trigger');

      expect(trigger).not.toBeDisabled();
      expect(trigger).toHaveAttribute('title', 'delete');

      await user.click(trigger);
      await user.click(screen.getByTestId('batch-delete-confirm'));

      expect(deleteStatement).toHaveBeenCalledWith('s4');
      await waitFor(() => expect(toastError).toHaveBeenCalledWith(
        'Los extractos de una cuenta conectada al banco no se pueden eliminar.',
      ));
      expect(toastError).not.toHaveBeenCalledWith(BANK_CONNECTED);
    });
  });

  // ETP-4921 — the single-row delete confirm (StatementRowKebab / hover trash) used to show only
  // the flat, variant-generic 'financeAccountStatementsDeleteError' toast on ANY failure, with no
  // hint of why. It now surfaces the backend's actual reason when backendErrors.js has a
  // translation for it — same wiring the sync-result toast already proved (ETP-4891, see above).
  it('translates the delete-confirm error into the actual reason instead of the generic toast', async () => {
    uiMock.mockImplementation((key) => (key === 'backendError.statementNotDraft'
      ? 'Los extractos procesados no se pueden modificar'
      : key));
    deleteStatement.mockRejectedValueOnce(new Error('Only draft (unprocessed) statements can be modified'));
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);

    await user.click(screen.getByTestId('row-delete-s1'));
    await user.click(screen.getByTestId('confirm-run'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(
      'Los extractos procesados no se pueden modificar',
    ));
    expect(toastError).not.toHaveBeenCalledWith('financeAccountStatementsDeleteError');
  });

  // An unmapped reason (network error, unrelated 5xx) has no backendErrors.js entry, so
  // translateBackendError returns it unchanged — falling through to it verbatim would show raw
  // English/technical text instead of the flat generic key this variant already had.
  it('falls back to the generic error toast when the backend reason has no translation', async () => {
    deleteStatement.mockRejectedValueOnce(new Error('Network request failed'));
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);

    await user.click(screen.getByTestId('row-delete-s1'));
    await user.click(screen.getByTestId('confirm-run'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('financeAccountStatementsDeleteError'));
  });
});
