import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, Upload, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUI } from '@/i18n';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import AccountPage from '@generated/financial-account/generated/web/financial-account/AccountPage';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFinancialAccount } from '@/hooks/useFinancialAccount';
import { useAccountMovements } from '@/hooks/useAccountMovements';
import { useBankStatements } from '@/hooks/useBankStatements';
import { useCsvExport } from '@/hooks/useCsvExport';
import { DetailTabs } from './DetailTabs';
import { MovementsTab } from './MovementsTab';
import { ReconciliationTab } from './ReconciliationTab';
import { ImportedStatementsTab } from './ImportedStatementsTab';
import { EditAccountModal } from './EditAccountModal.jsx';
import { ArchiveAccountDialog } from './ArchiveAccountDialog.jsx';
import { Psd2ConnectFlowUI } from './Psd2ConnectFlowUI.jsx';
import { usePsd2ConnectFlow } from '@/hooks/usePsd2ConnectFlow';
import { AutoMatchSuggestionModal } from '@/components/contract-ui/AutoMatchSuggestionModal';
import { useAutoMatch } from '@/hooks/useReconciliation';
import { SyncStatusInline } from '@/components/financial-accounts/SyncStatusInline';

const STATEMENTS_API_PATH = '/sws/neo/bank-statements';
const TRANSACTIONS_API_PATH = '/sws/neo/financial-account-transactions';

// Movements CSV columns (key:Label:type). The Classic-parity transforms (type
// /status labels, deposit/withdrawal split, synthetic "Payment", processed flag)
// are pre-derived server-side on the transaction rows, so the generic exporter
// stays a dumb serializer. `foreignAmount`/`foreignCurrency` are not exposed yet
// → those keys are absent on the row and render as empty cells (as in Classic).
const MOVEMENT_CSV_COLUMNS = [
  'transactionTypeLabel:Transaction Type',
  'paymentLabel:Payment',
  'date:Transaction Date:date',
  'contact:Business Partner',
  'documentNo:Payment No.',
  'glItem:G/L Item',
  'description:Description',
  'depositAmount:Deposit Amount',
  'withdrawalAmount:Withdrawal Amount',
  'currencyIso:Currency',
  'statusLabel:Status',
  'foreignAmount:Foreign  Amount',
  'foreignCurrency:Foreign Currency',
  'processed:Processed',
].join('|');

// CSV column specs (key:Label:type) consumed by the generic server-side export.
// Labels are English to match Classic's exported files; `:date` columns are
// reformatted to dd-MM-yyyy server-side; `txns.0.documentNo` is a dotted path.
const HEADER_CSV_COLUMNS = [
  'documentNo:Document No.',
  'name:Name',
  'fileName:File Name',
  'notes:Notes',
  'importDate:Import Date:date',
  'transactionDate:Transaction Date:date',
  'lineCount:Lines',
  'totalOut:Amount OUT',
  'totalIn:Amount IN',
  'status:Status',
].join('|');

const LINE_CSV_COLUMNS = [
  'description:Description',
  'lineNo:Line No.',
  'date:Transaction Date:date',
  'reference:Reference No.',
  'bpartnerName:Business Partner Name',
  'bpartnerFkName:Business Partner',
  'glItemName:G/L Item',
  'out:Amount OUT',
  'in:Amount IN',
  'matched:Matching Type',
  'txns.0.documentNo:Financial account transaction',
].join('|');

/**
 * Financial Account detail view (single account: Movimientos / Extractos /
 * Conciliación). Rendered for /financial-account/{recordId} by the wrapper at the
 * bottom of this file.
 *
 * Still fully hand-written: PSD2, the reconciliation engine and the statement
 * import have no AD backing, so they are not expressible through the contract.
 * Only the LIST half of this window went decisions-driven.
 *
 * @param {{ recordId: string }} props
 */
export function FinancialAccountDetail({ recordId }) {
  const ui = useUI();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') ?? 'movements');
  // Edit modal (ETP-4530): reachable from the detail view too, not just the accounts-list kebab.
  const [editOpen, setEditOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  // The automatch modal opens whenever the user enters the Reconciliation tab — either via the
  // accounts-list pill (autoMatch=true), a deep link to the tab, or by clicking the tab here.
  const [autoMatchOpen, setAutoMatchOpen] = useState(
    () => searchParams.get('autoMatch') === 'true' || searchParams.get('tab') === 'reconciliation',
  );
  // Transaction to highlight in the Movements tab (deep-link from the reconciled-txns modal arrow).
  const [highlightTxnId, setHighlightTxnId] = useState(() => searchParams.get('txn') || null);
  // Auto-open the New-movement modal (deep-link from the accounts-grid row kebab).
  const [autoOpenNewMovement, setAutoOpenNewMovement] = useState(
    () => searchParams.get('newMovement') === 'true',
  );

  // Switching INTO the Reconciliation tab opens the automatch modal first.
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    setHighlightTxnId(null);
    if (tab === 'reconciliation') {
      setAutoMatchOpen(true);
    }
  }, []);

  // Apply deep-link params (tab / autoMatch / txn) and clear them. Reacts to searchParams changes
  // — not just mount — because navigating within the SAME account (e.g. from the reconciled-txns
  // modal to the Movements tab) updates the URL without remounting this window.
  useEffect(() => {
    const tab = searchParams.get('tab');
    const txn = searchParams.get('txn');
    const autoMatch = searchParams.get('autoMatch');
    const newMovement = searchParams.get('newMovement');
    if (!tab && !txn && !autoMatch && !newMovement) return;
    if (tab) setActiveTab(tab);
    if (txn) setHighlightTxnId(txn);
    if (autoMatch === 'true' || tab === 'reconciliation') setAutoMatchOpen(true);
    if (newMovement === 'true') setAutoOpenNewMovement(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const { account, reload: reloadAccount } = useFinancialAccount(recordId);
  // ETP-4530: powers the Edit modal's "Connect to PSD2" button from this entry point too — same
  // flow/UI as the accounts list (FinancialAccountsPage.jsx), just reloading the account instead.
  const psd2Flow = usePsd2ConnectFlow({ onDone: reloadAccount });
  const { groups: autoMatchGroups, kpis: autoMatchKpis, reload: reloadAutoMatch } = useAutoMatch(
    autoMatchOpen ? recordId : null,
  );
  const { movements, totals, enabledDimensions, headerDimensions, trxTypes, accountOrgId, paymentMethods, loading: movementsLoading, reload: reloadMovements } = useAccountMovements(recordId);
  // Bumped after an automatch apply so the reconciliation panel remounts and re-runs the matching
  // algorithms (fresh pending lines + suggestions), keeping the view in sync after each reconcile.
  const [reconciliationRefreshKey, setReconciliationRefreshKey] = useState(0);
  const handleAutoMatchSuccess = useCallback(() => {
    reloadAccount();
    reloadAutoMatch();
    reloadMovements();
    setReconciliationRefreshKey((k) => k + 1);
  }, [reloadAccount, reloadAutoMatch, reloadMovements]);
  const { statements } = useBankStatements(recordId);
  const movementsTabRef = useRef(null);
  const statementsTabRef = useRef(null);
  const runCsvExport = useCsvExport();

  // Statements export is context-aware: with statement(s) selected it streams
  // their LINES (Classic-style); with no selection it streams the currently
  // filtered statement HEADERS. Both reuse the existing bank-statements GET via
  // the generic `export=csv` flag, so the server handles large lists.
  const exportStatements = async () => {
    const tab = statementsTabRef.current;
    const selected = tab?.getSelectedStatementIds?.() ?? [];
    const safeName = (account?.name ?? 'statements').replace(/[^\w.-]+/g, '_');
    try {
      if (selected.length > 0) {
        await runCsvExport({
          path: STATEMENTS_API_PATH,
          params: {
            action: 'lines',
            statementIds: selected.join(','),
            columns: LINE_CSV_COLUMNS,
          },
          filename: `${safeName}_lines`,
        });
      } else {
        const filtered = tab?.getFilteredStatements?.() ?? statements;
        if (!filtered || filtered.length === 0) {
          toast.error(ui('financeAccountDetailExportEmpty'));
          return;
        }
        await runCsvExport({
          path: STATEMENTS_API_PATH,
          params: {
            FIN_Financial_Account_ID: account?.id ?? recordId,
            ids: filtered.map((s) => s.id).join(','),
            columns: HEADER_CSV_COLUMNS,
          },
          filename: `${safeName}_statements`,
        });
      }
      toast.success(ui('financeAccountDetailExportDone'));
    } catch {
      toast.error(ui('financeAccountDetailExportError'));
    }
  };

  // Movements export now also goes through the generic backend CSV flow
  // (`?export=csv`), so large lists stream from the server. Classic-parity
  // columns are pre-derived on the transaction rows; the front only sends the
  // filtered ids + column spec.
  const exportMovements = async () => {
    const rows = movementsTabRef.current?.getFilteredMovements() ?? movements;
    if (!rows || rows.length === 0) {
      toast.error(ui('financeAccountDetailExportEmpty'));
      return;
    }
    const safeName = (account?.name ?? 'movements').replace(/[^\w.-]+/g, '_');
    try {
      await runCsvExport({
        path: TRANSACTIONS_API_PATH,
        params: {
          FIN_Financial_Account_ID: account?.id ?? recordId,
          ids: rows.map((m) => m.id).join(','),
          columns: MOVEMENT_CSV_COLUMNS,
        },
        filename: `${safeName}_movements`,
      });
      toast.success(ui('financeAccountDetailExportDone'));
    } catch {
      toast.error(ui('financeAccountDetailExportError'));
    }
  };

  const handleExport = () => {
    if (activeTab === 'movements') {
      exportMovements();
      return;
    }
    if (activeTab === 'statements') {
      exportStatements();
    }
  };

  const accountName = account?.name ?? '';
  useSetPageMeta(
    {
      title: accountName,
      titleExtra: account ? <SyncStatusInline account={account} data-testid="SyncStatusInline__f7dbb3" /> : null,
      breadcrumb: `${ui('financeMenuLabel')} / ${ui('financeAccountsPageTitle')} / ${accountName}`,
    },
    [accountName, account?.type, account?.psd2Connected, account?.psd2Pending],
  );

  // ETP-4658 — this custom window never delegated to the generated AccountPage.jsx
  // (registry.js loads this file for "financial-account", not @generated/...), so it
  // never picked up the ETP-4520 access-tier guard despite the contract carrying a
  // real window.id. Checked here, after every other hook, so hook order stays stable
  // across renders regardless of the tier (mirrors custom/sales-invoice/index.jsx).
  // Only the "none" tier is gated — propagating "read-only" would require threading
  // it through every mutation hook in this window (useAccountMutations,
  // useReconciliation, PSD2 actions, ...), out of scope here.
  const windowAccessTier = useWindowAccess('94EAA455D2644E04AB25D93BE5157B6D');
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="94EAA455D2644E04AB25D93BE5157B6D" data-testid="WindowAccessGuard__financial-account" />;
  }

  return (
    <TooltipProvider data-testid="TooltipProvider__f7dbb3">
      <div className="flex h-full flex-col overflow-hidden">

        {/* Tab strip + Edit / Export button */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] pl-0 pr-2">
          <DetailTabs
            value={activeTab}
            onValueChange={handleTabChange}
            movementsCount={movements.length}
            reconciliationCount={account?.pendingCount ?? 0}
            statementsCount={statements.length}
            data-testid="DetailTabs__f7dbb3" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="financial-account-edit"
              onClick={() => setEditOpen(true)}
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm font-medium leading-6 text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] hover:bg-[hsl(var(--muted))]"
            >
              <Pencil className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="Pencil__f7dbb3" />
              <span className="px-1">{ui('financeAccountsMenuEdit')}</span>
            </button>
            {activeTab === 'reconciliation' ? (
              <button
                type="button"
                data-testid="financial-account-automatch"
                onClick={() => setAutoMatchOpen(true)}
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm font-medium leading-6 text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] hover:bg-[hsl(var(--muted))]"
              >
                <Sparkles className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="Sparkles__f7dbb3" />
                <span className="px-1">{ui('financeReconcileActionAutomatch')}</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="financial-account-export"
                onClick={handleExport}
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 text-sm font-medium leading-6 text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] hover:bg-[hsl(var(--muted))]"
              >
                <Upload className="h-6 w-6 text-[hsl(var(--text-disabled))]" data-testid="Upload__f7dbb3" />
                <span className="px-1">{ui('financeAccountDetailExport')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex flex-1 flex-col overflow-auto">
          {activeTab === 'movements' && (
            <MovementsTab
              ref={movementsTabRef}
              account={account}
              totals={totals}
              movements={movements}
              enabledDimensions={enabledDimensions}
              headerDimensions={headerDimensions}
              trxTypes={trxTypes}
              accountOrgId={accountOrgId}
              paymentMethods={paymentMethods}
              loading={movementsLoading}
              onReload={reloadMovements}
              highlightTxnId={highlightTxnId}
              autoOpenNewMovement={autoOpenNewMovement}
              data-testid="MovementsTab__f7dbb3" />
          )}
          {activeTab === 'reconciliation' && (
            <ReconciliationTab
              key={reconciliationRefreshKey}
              account={account}
              onReconcileSuccess={() => { reloadAccount(); reloadMovements(); reloadAutoMatch(); }}
              data-testid="ReconciliationTab__f7dbb3" />
          )}
          {activeTab === 'statements' && (
            <ImportedStatementsTab
              ref={statementsTabRef}
              account={account}
              data-testid="ImportedStatementsTab__f7dbb3" />
          )}
        </div>
      </div>
      <AutoMatchSuggestionModal
        accountId={recordId}
        accountName={account?.name ?? ''}
        groups={autoMatchGroups}
        kpis={autoMatchKpis}
        currency={account?.currencyIso ?? 'EUR'}
        open={autoMatchOpen}
        onClose={() => setAutoMatchOpen(false)}
        onSuccess={handleAutoMatchSuccess}
        data-testid="AutoMatchSuggestionModal__f7dbb3" />
      <EditAccountModal
        open={editOpen}
        account={account}
        onClose={() => setEditOpen(false)}
        onSaved={reloadAccount}
        onArchive={(acc) => { setEditOpen(false); setArchiveTarget(acc); }}
        onConnect={(acc) => { setEditOpen(false); psd2Flow.startConnect(acc); }}
        data-testid="EditAccountModal__f7dbb3" />
      <ArchiveAccountDialog
        open={!!archiveTarget}
        account={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={() => { setArchiveTarget(null); navigate('/financial-account'); }}
        data-testid="ArchiveAccountDialog__f7dbb3" />
      <Psd2ConnectFlowUI flow={psd2Flow} data-testid="Psd2ConnectFlowUI__f7dbb3" />
    </TooltipProvider>
  );
}

/**
 * Window entry point for `financial-account`, resolved through
 * `registry.js`'s customLoaders (which win over windowLoaders).
 *
 * Mirrors the split used by `custom/sales-invoice/index.jsx`, inverted: there the
 * DETAIL delegates to the generated page and the list is hand-rolled; here the
 * LIST is the generated page (ListView + the AccountsHeaderTable slot, driven by
 * decisions.json) and the DETAIL stays hand-written above.
 *
 * `recordId` is passed down by WindowLoader from the `:windowName/:recordId` route;
 * it is explicitly NOT forwarded to the generated page, whose own `if (recordId)`
 * branch would otherwise render the generic DetailView instead of our tabs.
 */
export default function FinancialAccountWindow(props) {
  if (props.recordId) {
    return <FinancialAccountDetail recordId={props.recordId} data-testid="FinancialAccountDetail__f7dbb3" />;
  }
  // `listViewOptions` reaches ListView through AccountPage's `{...props}` spread.
  // AccountsHeaderTable renders the window's whole toolbar itself, so ListView's
  // native list bar must be dropped entirely — the individual hide* flags leave an
  // empty padded strip behind (sort/refresh have no flag of their own).
  return (
    <AccountPage
      {...props}
      recordId={undefined}
      listViewOptions={{
        ...(props.listViewOptions || {}),
        hideListBar: true,
        // AccountsHeaderTable pins its toolbar + KPI sidebar and scrolls only the rows,
        // so it must not sit inside ListView's own ScrollPane.
        tableOwnsScroll: true,
      }}
      data-testid="AccountPage__f7dbb3" />
  );
}
