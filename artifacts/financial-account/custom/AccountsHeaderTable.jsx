// Cuentas list body: toolbar + KPI sidebar + accounts grid, mounted by the
// generated AccountPage through `window.customComponents.headerTable`.
//
// Replaces the hand-assembled `pages/FinancialAccountsPage.jsx`, which lived on a
// hardcoded `finance/accounts` route outside the window system entirely.
//
// WHY EVERYTHING IS IN THIS ONE SLOT (and not split across `listKpiCards`):
// the type filter and the free-text search live in the toolbar but filter the
// grid, and ListView renders its slots as independent siblings with no shared
// state. Keeping toolbar + sidebar + table in a single slot keeps that state
// local and reproduces the original layout (full-width toolbar on top, then
// sidebar | table). The sidebar is a flex sibling of the table because ListView
// has no left-panel prop — same approach as
// `windows/custom/shared/PaymentHeaderTableBase.jsx`.
//
// DATA: rows arrive as `data` from ListView's own useEntity fetch of the `account`
// entity. The W spec now returns the derived fields the list needs
// (`pendingCount`, `psd2Connected`, `currencyIso`, `iban`, `active`, …), injected
// by FinancialAccountHandler.afterHandle, and the sidebar aggregates come from
// `meta.summary` — a sibling of `response.data` on that same request. One fetch
// feeds both, so the bespoke `financial-accounts-page` R spec is no longer needed.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/contract-ui';
import { useUI, useLocaleSwitch } from '@/i18n';
import { usePsd2Actions } from '@/hooks/usePsd2Actions.js';
import { usePsd2ConnectFlow } from '@/hooks/usePsd2ConnectFlow.js';
import {
  AccountsSidebar,
  AccountsToolbar,
  AccountTypeFilter,
} from '@/components/financial-accounts';
import {
  NameCell,
  TypeCell,
  BalanceCell,
} from '@/components/financial-accounts/AccountsTable/accountColumns.jsx';
import { ReconcilePill } from '@/components/financial-accounts/ReconcilePill.jsx';
import { AccountRowActions } from '@/components/financial-accounts/AccountRowActions.jsx';
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns.js';
import { NewAccountWizard } from '@/windows/custom/financial-account/NewAccountWizard.jsx';
import { EditAccountModal } from '@/windows/custom/financial-account/EditAccountModal.jsx';
import { ArchiveAccountDialog } from '@/windows/custom/financial-account/ArchiveAccountDialog.jsx';
import { Psd2ConnectFlowUI } from '@/windows/custom/financial-account/Psd2ConnectFlowUI.jsx';
import { FundsTransferModal } from '@/windows/custom/financial-account/FundsTransferModal.jsx';
import { ConfirmDialog } from '@/components/OAuth2ClientDialog';

/* eslint-disable react/prop-types */

// Per-column presentation the contract cannot express: the Figma layout pins these
// widths, and `pl-[84px]` aligns the "Cuenta" header with the row avatar. Consumed
// through DataTable's `col.headClass` / `col.cellClass`.
const COLUMN_CHROME = {
  name: { headClass: 'w-[480px] pl-[84px] pr-2', cellClass: 'w-[480px] p-0' },
  type: { headClass: 'w-[340px] px-2', cellClass: 'w-[340px] px-2 py-2' },
  currentBalance: { headClass: 'w-[200px] px-2', cellClass: 'w-[200px] px-2 text-right' },
};

const CELL_BODIES = {
  name: (row, { ui, onConnect }) => <NameCell account={row} ui={ui} onConnect={onConnect} />,
  type: (row, { ui }) => <TypeCell account={row} ui={ui} />,
  currentBalance: (row) => <BalanceCell account={row} />,
};

const COLUMN_LABEL_KEY = {
  name: 'financeAccountsColAccount',
  type: 'financeAccountsColType',
  currentBalance: 'financeAccountsColBalance',
};

/**
 * Contract-driven data columns plus the two synthetic ones ("Por conciliar" and the
 * hover actions), in DataTable's `columns` shape. Which data columns appear and in
 * what order still comes from the contract via getContractGridColumns('account').
 */
function buildColumns(ui, locale, handlers) {
  const cellCtx = { ui, onConnect: (account) => handlers.onPsd2Action('connect', account) };

  const dataColumns = getContractGridColumns('account').map((col) => ({
    key: col.name,
    column: col.column,
    type: col.type,
    // `labels[locale]` wins over the AD dictionary, so the Figma header text is kept.
    labels: { [locale]: ui(COLUMN_LABEL_KEY[col.name] ?? col.name) },
    sortable: false,
    ...(COLUMN_CHROME[col.name] ?? {}),
    render: CELL_BODIES[col.name]
      ? (row) => CELL_BODIES[col.name](row, cellCtx)
      : undefined,
  }));

  return [
    ...dataColumns,
    {
      key: 'pendingCount',
      labels: { [locale]: ui('financeAccountsColPending') },
      sortable: false,
      headClass: 'w-[280px] px-2',
      cellClass: 'w-[280px] px-2',
      // The whole row navigates, so the pill swallows its own click.
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()} role="presentation" className="inline-flex">
          <ReconcilePill pendingCount={row.pendingCount} onClick={() => handlers.onReconcile(row)} />
        </span>
      ),
    },
    {
      key: '_rowActions',
      labels: { [locale]: '' },
      sortable: false,
      headClass: 'min-w-[90px]',
      cellClass: 'min-w-[90px] px-2',
      render: (row) => (
        <span onClick={(e) => e.stopPropagation()} role="presentation" className="block">
          <AccountRowActions
            account={row}
            onOpen={handlers.onOpen}
            onEdit={handlers.onEdit}
            onArchive={handlers.onArchive}
            onPsd2Action={handlers.onPsd2Action}
            onTransfer={handlers.onTransfer}
            onNewMovement={handlers.onNewMovement} />
        </span>
      ),
    },
  ];
}

/**
 * Default account first, then alphabetical — the ordering the accounts-page SQL used
 * (`ORDER BY fa.isdefault DESC, fa.name ASC`). The generic CRUD does not guarantee a
 * stable order, so without this the rows visibly reshuffle between loads.
 */
export function sortAccounts(accounts) {
  return [...accounts].sort((a, b) => {
    if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''));
  });
}

/** Hides archived accounts by default; the "Inactivas" view shows only those, any type. */
export function filterAccounts(accounts, typeFilter, search) {
  if (!Array.isArray(accounts)) return [];
  const needle = (search ?? '').trim().toLowerCase();
  const inactiveView = typeFilter === AccountTypeFilter.INACTIVE;
  return accounts.filter((account) => {
    const isActive = account.active !== false;
    if (inactiveView) {
      if (isActive) return false;
    } else {
      if (!isActive) return false;
      if (typeFilter && account.type !== typeFilter) return false;
    }
    if (!needle) return true;
    return [account.name, account.iban, account.currencyIso]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle));
  });
}

export default function AccountsHeaderTable({ data, meta, onDataMutated, ...props }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [transferSource, setTransferSource] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const reload = () => onDataMutated?.();
  const { sync, disconnect } = usePsd2Actions();
  const psd2Flow = usePsd2ConnectFlow({ onDone: reload });


  const handlePsd2Action = async (action, account) => {
    if (action === 'connect') {
      psd2Flow.startConnect(account);
      return;
    }
    if (action === 'syncNow') {
      try {
        const res = await sync(account.id);
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
        toast.error(err.message || ui('financeAccountsPsd2SyncError'));
      }
      return;
    }
    if (action === 'disconnect') {
      setDisconnectTarget(account);
    }
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    try {
      await disconnect(disconnectTarget.id);
      toast.success(ui('financeAccountsPsd2DisconnectDone'));
      setDisconnectTarget(null);
      reload();
    } catch (err) {
      toast.error(err.message || ui('financeAccountsPsd2DisconnectError'));
    } finally {
      setDisconnecting(false);
    }
  };

  const handlers = {
    onOpen: (account) => navigate(`/financial-account/${account.id}`),
    onReconcile: (account) => navigate(`/financial-account/${account.id}?tab=reconciliation&autoMatch=true`),
    onNewMovement: (account) => navigate(`/financial-account/${account.id}?tab=movements&newMovement=true`),
    onEdit: setEditAccount,
    onArchive: setArchiveTarget,
    onTransfer: setTransferSource,
    onPsd2Action: handlePsd2Action,
  };

  const columns = useMemo(
    () => buildColumns(ui, locale, handlers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ui, locale],
  );
  const visibleAccounts = useMemo(
    () => sortAccounts(filterAccounts(data, typeFilter, search)),
    [data, typeFilter, search],
  );

  return (
    // Height comes from the parent, not from JS measurement: the wrapper sets
    // `listViewOptions.tableOwnsScroll`, so ListView renders this slot inside a bounded
    // flex box instead of its own ScrollPane. `h-full` therefore resolves against a real
    // height, and the single `overflow-y-auto` further down (around the rows) is the only
    // scrolling region — toolbar and KPI panel stay pinned. Wrapping this in ListView's
    // ScrollPane instead would add a SECOND, outer scroll that drags those away, plus
    // ScrollPane's always-visible shadow scrollbar.
    //
    // Trade-off: `onReachBottom` belongs to that ScrollPane, so infinite scroll is inert
    // here — same as the previous hand-rolled page, which loaded every account in one
    // request. Only matters past one batch (75 accounts).
    <div className="flex h-full flex-col overflow-hidden" data-testid="cuentas-card">
      {/* Fixed: toolbar */}
      <div className="shrink-0 border-b border-[hsl(var(--border-subtle))] p-2">
        <AccountsToolbar
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          search={search}
          onSearchChange={setSearch}
          onNewAccount={() => setWizardOpen(true)}
          onMatchingRules={() => navigate('/match-rule')}
          data-testid="AccountsToolbar__accthdr" />
      </div>

      {/* min-h-0 lets the flex child actually shrink so the inner overflow engages */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Fixed: KPI sidebar (brings its own w-[292px] shrink-0) */}
        <AccountsSidebar summary={meta?.summary ?? null} loading={false} data-testid="AccountsSidebar__accthdr" />

        {/* Vertical rule between the KPI panel and the rows, as in the original page */}
        <div className="w-px self-stretch bg-[hsl(var(--border-subtle))]" aria-hidden="true" />
        {/* The only scrolling region */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'auto' }}>
          <DataTable
            {...props}
            data={visibleAccounts}
            columns={columns}
            filters={[]}
            // DataTable calls this with the whole ROW, not an id (DataTable.jsx:1902,
            // `onNavigate(row)`). Taking it as an id produced /financial-account/[object Object].
            onNavigate={(row) => handlers.onOpen(row)}
            onDataMutated={onDataMutated}
            showFooterTotals={false}
            // This list has no bulk operations and owns its own hover actions
            // (AccountRowActions, in the trailing synthetic column), so DataTable's
            // defaults would add a selection checkbox column and a generic
            // delete/quick-actions overlay that are not part of this design.
            selectable={false}
            rowQuickActions={null}
            hoverRowActions={false}
            data-testid="DataTable__accthdr" />
        </div>
      </div>

      <NewAccountWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={reload}
        onConnectWithCreation={psd2Flow.startCreate}
        data-testid="NewAccountWizard__accthdr" />
      <EditAccountModal
        open={!!editAccount}
        account={editAccount}
        onClose={() => setEditAccount(null)}
        onSaved={reload}
        onArchive={(acc) => { setEditAccount(null); setArchiveTarget(acc); }}
        onConnect={(acc) => { setEditAccount(null); handlePsd2Action('connect', acc); }}
        data-testid="EditAccountModal__accthdr" />
      <ArchiveAccountDialog
        open={!!archiveTarget}
        account={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={reload}
        data-testid="ArchiveAccountDialog__accthdr" />
      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(o) => { if (!o) setDisconnectTarget(null); }}
        title={ui('financeAccountsPsd2DisconnectTitle')}
        description={ui('financeAccountsPsd2DisconnectBody')}
        confirmLabel={ui('financeAccountsPsd2DisconnectConfirm')}
        cancelLabel={ui('cancel')}
        loading={disconnecting}
        onConfirm={handleConfirmDisconnect}
        data-testid="ConfirmDialog__accthdr" />
      {transferSource && (
        <FundsTransferModal
          open
          sourceAccountId={transferSource.id}
          onClose={() => setTransferSource(null)}
          onDone={reload}
          data-testid="FundsTransferModal__accthdr" />
      )}
      <Psd2ConnectFlowUI flow={psd2Flow} data-testid="Psd2ConnectFlowUI__accthdr" />
    </div>
  );
}
