import { useCallback, useState, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import { useUI, useLocaleSwitch } from '@/i18n';
import { translateBackendError } from '@/lib/backendErrors.js';
import { useBankStatements } from '@/hooks/useBankStatements';
import { useStatementActions } from '@/hooks/useStatementActions';
import { useBankConnectionActions } from '@/hooks/useBankConnectionActions';
import { useBatchDeleteDialog } from '@/hooks/useBatchDeleteDialog.jsx';
import { StatementsToolbar } from './StatementsToolbar';
import {
  StatementsTable,
  buildStatementSortAccessors,
  buildStatementSortColumns,
} from './StatementsTable';
import { ListSortPopover } from '@/components/contract-ui/ListSortPopover.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { useClientSort } from '@/hooks/useClientSort';
import { StatementLinesView } from './StatementLinesView';
import { ImportStatementModal } from './ImportStatementModal';
import { ManualStatementModal } from './ManualStatementModal';
import { StatementConfirmDialog } from './StatementConfirmDialog';
import { applyAdvancedFilter } from './statementAdvancedFilter';
import { getDateBounds } from '@/lib/dateRangeBounds';
import { parseCalendarDate } from '@/lib/dateOnly';
import { isDraftStatement } from './statementStatus.js';
import { BulkDeleteSelectionBar } from '@/components/financial-accounts';

/**
 * Why the bulk-delete trigger is blocked, as a ready-to-show tooltip, or `null` when it is free
 * to fire. Two independent reasons, checked in order of how absolute they are (ETP-4921):
 *
 *  1. The account is connected to the bank (PSD2). Its statements come from the bank and are
 *     read-only, whatever their state — nothing the user does in this window unblocks it, so this
 *     wins over the per-statement reason below, which would otherwise point them at a state they
 *     could try to change.
 *  2. The selection contains a processed statement. That one IS state-dependent: reactivating it
 *     first makes it deletable.
 *
 * A plain function rather than inline ternaries so the precedence is stated once and testable.
 *
 * @param {{ ui: Function, bankConnectionSynced: boolean, selectionHasNonDraft: boolean }} args
 * @returns {string|null}
 */
export function resolveBulkDeleteBlock({ ui, bankConnectionSynced, selectionHasNonDraft }) {
  if (bankConnectionSynced) return ui('financeAccountStatementsRowBankSyncedTooltip');
  if (selectionHasNonDraft) return ui('financeAccountStatementsRowProcessedTooltip');
  return null;
}

/**
 * Imported Statements tab for the Financial Account detail view.
 *
 * State machine:
 *   selectedStatementId == null  → list view
 *   selectedStatementId != null  → lines sub-view (← button clears it)
 *
 * Exposes `getSelectedStatementIds()` and `getFilteredStatements()` via ref so
 * the parent's Export button can decide what to export: the filtered statement
 * headers (no selection) or the lines of the selected statement(s).
 *
 * @param {{ account: object }} props
 */
export const ImportedStatementsTab = forwardRef(function ImportedStatementsTab({ account }, ref) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  // The `name` sort accessor formats a periodFrom–periodTo range for statements with no name,
  // so it needs the same locale the cell uses.
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const accountId = account?.id ?? null;
  const currency = account?.currencyIso ?? 'EUR';
  // bank-synced accounts get their statements only from Salt Edge, so manual import / manual
  // line creation are not offered: the import split-button is replaced by a single "sync
  // statements" action that runs the bank fetch (Classic's "Get Bank Statement" equivalent).
  const bankConnectionSynced = account?.bankConnected === true;

  const { statements, loading, reload } = useBankStatements(accountId);
  const { processStatement, reactivateStatement, deleteStatement, busy } = useStatementActions();
  const { sync } = useBankConnectionActions();
  const [syncing, setSyncing] = useState(false);

  const [selectedStatementId, setSelectedStatementId] = useState(null);
  const [search, setSearch] = useState('');
  // Default to the last 30 days, mirroring the Movements tab, so both tabs of the
  // account open with the same date window instead of "any date".
  const [dateRange, setDateRange] = useState({ presetId: 'last30' });
  // Row selection (checkboxes), same plumbing as the Movements tab.
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [status, setStatus] = useState(null);
  const [advancedFilter, setAdvancedFilter] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  // Row actions: the statement being edited and the pending process/delete confirm.
  const [editingStatement, setEditingStatement] = useState(null);
  const [confirm, setConfirm] = useState({ variant: null, statement: null });

  const selectedStatement = statements.find((s) => s.id === selectedStatementId) ?? null;

  const rowActions = useMemo(() => ({
    onEdit: (s) => setEditingStatement(s),
    onProcess: (s) => setConfirm({ variant: 'process', statement: s }),
    onReactivate: (s) => setConfirm({ variant: 'reactivate', statement: s }),
    onDelete: (s) => setConfirm({ variant: 'delete', statement: s }),
  }), []);

  const handleSelectionChange = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closeConfirm = () => setConfirm({ variant: null, statement: null });

  // ETP-4656 (Gap 3) — bulk "Delete selected" for the imported-statements grid,
  // wired onto the checkbox selection that already existed here. Reuses the same
  // deleteStatement(id) call the per-row hover quick-action already makes (see
  // StatementsTable).
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ETP-4921 — `reload()` only refetches the statement HEADERS. The lines of an EXPANDED row come
  // from StatementLinesInline's own `useBankStatementLines(statementId)`, keyed solely on the id,
  // so nothing ever invalidated it: after editing a line in the modal the header row showed the
  // new total while the rows underneath still showed the pre-edit amounts, and the toolbar's
  // refresh button looked broken (it reloaded exactly the half that was already correct). This
  // token is bumped alongside every reload; `refreshStatements` is what all mutation paths and
  // the refresh button call, so the two halves can no longer drift apart.
  const [linesRefreshToken, setLinesRefreshToken] = useState(0);
  const refreshStatements = useCallback(() => {
    reload();
    setLinesRefreshToken((t) => t + 1);
  }, [reload]);

  // ETP-4921 — a processed statement can never be deleted (Classic parity: once downloaded it's
  // processed, and reversing that takes an explicit Reactivar first). The per-row hover trash
  // was already hidden for those rows (StatementsTable's own isDraftStatement gate), but the
  // SELECTION checkboxes have no such gate — they double as the source for the tab's Export
  // button, so hiding them would break exporting a processed statement's lines. The bulk-delete
  // trigger is what actually attempts the delete, so THAT is what gets blocked here: whenever the
  // current selection includes a non-draft statement, the button disables with the same "cannot
  // be modified while processed" tooltip StatementRowKebab already shows for Procesar — "don't
  // let them touch the trash can", not "let them try and fail".
  const selectionHasNonDraft = useMemo(
    () => Array.from(selectedIds).some((id) => {
      const s = statements.find((st) => st.id === id);
      return s ? !isDraftStatement(s) : false;
    }),
    [selectedIds, statements],
  );
  // Two independent reasons the bulk trash refuses to fire. The connected-account one is checked
  // FIRST because it is unconditional: on a PSD2 account no statement is deletable at all, so
  // saying "processed statements cannot be modified" there would point the user at a state they
  // could try to change, when nothing in this window unblocks it.
  const bulkDeleteDisabledReason = resolveBulkDeleteBlock({
    ui, bankConnectionSynced, selectionHasNonDraft,
  });

  const { requestBatchDelete, batchDeleteDialog, deleting: bulkDeleting } = useBatchDeleteDialog({
    deleteOneFn: (id) => deleteStatement(id),
    onOutcome: (succeeded, failed) => {
      if (succeeded.length > 0) refreshStatements();
      if (failed.length === 0) {
        clearSelection();
      } else {
        setSelectedIds(new Set(failed));
      }
    },
  });

  // Runs the bank statement fetch for this account (same backend action behind the kebab's
  // "Sync now"). The bridge mirrors Classic's "Get Bank Statement": it returns a status
  // (Success/WARNING/ERROR) plus the localized process message rather than throwing.
  const handleSyncStatements = async () => {
    if (!accountId || syncing) return;
    setSyncing(true);
    try {
      const res = await sync(accountId);
      refreshStatements();
      // ETP-4891 follow-up: com.etendoerp.psd2 ships no real es_ES translation for these
      // AD_MESSAGEs (see backendErrors.js), so Core always resolves the English text — route it
      // through the same frontend translation map every other untranslated backend message uses.
      const msg = res?.message ? translateBackendError(res.message, ui) : res?.message;
      if (res?.status === 'ERROR') {
        toast.error(msg || ui('financeAccountsBankConnectionSyncError'));
      } else if (res?.status === 'WARNING') {
        toast.info(msg || ui('financeAccountsBankConnectionSyncDone'));
      } else {
        toast.success(msg || ui('financeAccountsBankConnectionSyncDone'));
      }
    } catch (err) {
      toast.error(err?.message || ui('financeAccountsBankConnectionSyncError'));
    } finally {
      setSyncing(false);
    }
  };

  // Per-variant wiring for the confirm dialog: the action to run plus its
  // success / error toast keys. Keeps runConfirm free of nested branching.
  // The `error`/`success` values are i18n KEYS resolved later via ui(cfg.error);
  // they are not user-facing literals.
  // i18n-allowlist: ["financeAccountStatementsDeleteError", "financeAccountStatementsReactivateError", "financeAccountStatementsProcessError"]
  const CONFIRM_ACTIONS = {
    delete: {
      run: deleteStatement,
      success: 'financeAccountStatementsDeleteSuccess',
      error: 'financeAccountStatementsDeleteError',
    },
    reactivate: {
      run: reactivateStatement,
      success: 'financeAccountStatementsReactivateSuccess',
      error: 'financeAccountStatementsReactivateError',
    },
    process: {
      run: processStatement,
      success: 'financeAccountStatementsProcessSuccess',
      error: 'financeAccountStatementsProcessError',
    },
  };

  const runConfirm = async () => {
    const { variant, statement } = confirm;
    if (!statement) return;
    const cfg = CONFIRM_ACTIONS[variant] ?? CONFIRM_ACTIONS.process;
    try {
      await cfg.run(statement.id);
      toast.success(ui(cfg.success));
      closeConfirm();
      refreshStatements();
    } catch (err) {
      // ETP-4921 — show the backend's actual reason (e.g. "processed statements can't be
      // modified") when there is one to translate, instead of the flat generic-per-variant
      // toast, which used to say only "Could not delete/reactivate/process the statement"
      // with no hint of why. Falls back to that generic key for a message the map has no
      // translation for (network errors, unmapped 5xx) rather than showing raw English.
      const reason = translateBackendError(err?.message, ui);
      toast.error(reason && reason !== err?.message ? reason : ui(cfg.error));
    }
  };

  // NOTE: useMemo must run on every render (Rules of Hooks). Keep it BEFORE
  // the conditional early return for the lines sub-view.
  const filteredStatements = useMemo(() => {
    const { from, to } = getDateBounds(dateRange);
    const q = search.trim().toLowerCase();

    const base = statements.filter((s) => {
      if (status && s.status !== status) return false;
      if (from || to) {
        const d = parseCalendarDate(s.importDate);
        if (from && d && d < from) return false;
        if (to && d && d > to) return false;
      }
      if (q) {
        const haystack = [s.fileName, s.name, s.documentNo, s.notes]
          .map((v) => (v ?? '').toLowerCase())
          .join(' ');
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return applyAdvancedFilter(base, advancedFilter);
  }, [statements, search, dateRange, status, advancedFilter]);

  // Sorting lives HERE, not in the table: the "Ordenar por" popover belongs in the toolbar,
  // which is the table's sibling. Same split as ListView/DataTable. Client-side because this
  // list arrives whole from a handler that accepts no sort parameter — see lib/clientSort.js.
  const sortAccessors = useMemo(() => buildStatementSortAccessors(bcpLocale), [bcpLocale]);
  const sortColumns = useMemo(() => buildStatementSortColumns(ui), [ui]);
  const {
    sorted: sortedStatements, sortKey, sortDirection, toggleSort, selectSort, clearSort,
    isDefaultSort,
  } = useClientSort(filteredStatements, { accessors: sortAccessors });

  // Latest filtered headers + current selection reachable via ref, so the
  // parent's Export button can read them on click without subscribing here.
  const filteredRef = useRef(filteredStatements);
  filteredRef.current = filteredStatements;
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  useImperativeHandle(ref, () => ({
    getFilteredStatements: () => filteredRef.current,
    getSelectedStatementIds: () => Array.from(selectedRef.current),
  }), []);

  if (selectedStatementId) {
    return (
      <StatementLinesView
        statementId={selectedStatementId}
        statementName={selectedStatement?.fileName ?? selectedStatement?.name ?? ''}
        currency={currency}
        onBack={() => setSelectedStatementId(null)}
        data-testid="StatementLinesView__6f147a" />
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ETP-4972 — BulkDeleteSelectionBar now portals to a floating,
          viewport-fixed pill via SelectionToolbar; it no longer occupies a
          slot in this flow. */}
      <BulkDeleteSelectionBar
        count={selectedIds.size}
        deleting={bulkDeleting}
        onCancel={clearSelection}
        onDelete={() => requestBatchDelete(Array.from(selectedIds))}
        disabledReason={bulkDeleteDisabledReason}
        data-testid="StatementsBulkDeleteSelectionBar__6f147a" />
      <StatementsToolbar
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        status={status}
        onStatusChange={setStatus}
        advancedFilter={advancedFilter}
        onAdvancedFilterChange={setAdvancedFilter}
        rows={statements}
        onImportClick={() => setImportOpen(true)}
        onManualClick={() => setManualOpen(true)}
        bankConnectionSynced={bankConnectionSynced}
        onSyncClick={handleSyncStatements}
        syncing={syncing}
        onRefresh={refreshStatements}
        sortControl={(
          <ListSortPopover
            columns={sortColumns}
            sortColumn={sortKey}
            sortDirection={sortDirection}
            onSelect={selectSort}
            onClear={clearSort}
            isDefaultSort={isDefaultSort}
            data-testid="ListSortPopover__6f147a" />
        )}
        data-testid="StatementsToolbar__6f147a" />
      {/* Same refresh affordance a generated list gets from ListView — only once rows are on
          screen; the first fetch shows the table's own skeleton instead. */}
      {loading && statements.length > 0 ? (
        <ListProgressBar testId="statements-progress-bar" data-testid="ListProgressBar__6f147a" />
      ) : null}
      <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
        <StatementsTable
          statements={sortedStatements}
          loading={loading}
          currency={currency}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={toggleSort}
          actions={rowActions}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          linesRefreshToken={linesRefreshToken}
          bankConnected={bankConnectionSynced}
          data-testid="StatementsTable__6f147a" />
      </div>
      {batchDeleteDialog}
      <ImportStatementModal
        open={importOpen}
        accountId={accountId}
        accountCurrency={currency}
        onClose={() => setImportOpen(false)}
        onSuccess={refreshStatements}
        data-testid="ImportStatementModal__6f147a" />
      <ManualStatementModal
        open={manualOpen || !!editingStatement}
        accountId={accountId}
        accountCurrency={currency}
        statement={editingStatement}
        onClose={() => { setManualOpen(false); setEditingStatement(null); }}
        onSuccess={refreshStatements}
        data-testid="ManualStatementModal__6f147a" />
      <StatementConfirmDialog
        variant={confirm.variant}
        statement={confirm.statement}
        busy={busy}
        onConfirm={runConfirm}
        onClose={closeConfirm}
        data-testid="StatementConfirmDialog__6f147a" />
    </div>
  );
});
