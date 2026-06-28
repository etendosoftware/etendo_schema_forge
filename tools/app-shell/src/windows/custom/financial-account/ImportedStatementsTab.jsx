import { useState, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useBankStatements } from '@/hooks/useBankStatements';
import { useStatementActions } from '@/hooks/useStatementActions';
import { usePsd2Actions } from '@/hooks/usePsd2Actions';
import { StatementsToolbar } from './StatementsToolbar';
import { StatementsTable } from './StatementsTable';
import { StatementLinesView } from './StatementLinesView';
import { ImportStatementModal } from './ImportStatementModal';
import { ManualStatementModal } from './ManualStatementModal';
import { StatementConfirmDialog } from './StatementConfirmDialog';
import { applyAdvancedFilter } from './statementAdvancedFilter';
import { getDateBounds } from '@/lib/dateRangeBounds';

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
  const accountId = account?.id ?? null;
  const currency = account?.currencyIso ?? 'EUR';
  // PSD2-synced accounts get their statements only from Salt Edge, so manual import / manual
  // line creation are not offered: the import split-button is replaced by a single "sync
  // statements" action that runs the PSD2 fetch (Classic's "Get Bank Statement" equivalent).
  const psd2Synced = account?.psd2Connected === true;

  const { statements, loading, reload } = useBankStatements(accountId);
  const { processStatement, reactivateStatement, deleteStatement, busy } = useStatementActions();
  const { sync } = usePsd2Actions();
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

  // Runs the PSD2 statement fetch for this account (same backend action behind the kebab's
  // "Sync now"). The bridge mirrors Classic's "Get Bank Statement": it returns a status
  // (Success/WARNING/ERROR) plus the localized process message rather than throwing.
  const handleSyncStatements = async () => {
    if (!accountId || syncing) return;
    setSyncing(true);
    try {
      const res = await sync(accountId);
      reload();
      const msg = res?.message;
      if (res?.status === 'ERROR') {
        toast.error(msg || ui('financeAccountsPsd2SyncError'));
      } else if (res?.status === 'WARNING') {
        toast.info(msg || ui('financeAccountsPsd2SyncDone'));
      } else {
        toast.success(msg || ui('financeAccountsPsd2SyncDone'));
      }
    } catch (err) {
      toast.error(err?.message || ui('financeAccountsPsd2SyncError'));
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
      reload();
    } catch {
      toast.error(ui(cfg.error));
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
        const d = new Date(s.importDate);
        if (from && d < from) return false;
        if (to && d > to) return false;
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
        psd2Synced={psd2Synced}
        onSyncClick={handleSyncStatements}
        syncing={syncing}
        data-testid="StatementsToolbar__6f147a" />
      <div className="flex-1 overflow-y-auto [&>div]:overflow-visible">
        <StatementsTable
          statements={filteredStatements}
          loading={loading}
          currency={currency}
          actions={rowActions}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          data-testid="StatementsTable__6f147a" />
      </div>
      <ImportStatementModal
        open={importOpen}
        accountId={accountId}
        accountCurrency={currency}
        onClose={() => setImportOpen(false)}
        onSuccess={reload}
        data-testid="ImportStatementModal__6f147a" />
      <ManualStatementModal
        open={manualOpen || !!editingStatement}
        accountId={accountId}
        accountCurrency={currency}
        statement={editingStatement}
        onClose={() => { setManualOpen(false); setEditingStatement(null); }}
        onSuccess={reload}
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
