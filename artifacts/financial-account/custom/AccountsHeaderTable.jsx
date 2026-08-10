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
// (`pendingCount`, `bankConnected`, `currencyIso`, `iban`, `active`, …), injected
// by FinancialAccountHandler.afterHandle, and the sidebar aggregates come from
// `meta.summary` — a sibling of `response.data` on that same request. One fetch
// feeds both, so the bespoke `financial-accounts-page` R spec is no longer needed.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/contract-ui';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useBankConnectionActions, launchSaltEdgePopup } from '@/hooks/useBankConnectionActions.js';
import { useBankConnectionFlow } from '@/hooks/useBankConnectionFlow.js';
import {
  AccountsSidebar,
  AccountsToolbar,
  AccountTypeFilter,
} from '@/components/financial-accounts';
import {
  ACCOUNT_CELL_TYPES,
  resolveCellType,
} from '@/components/financial-accounts/accountCellTypes.jsx';
import { AccountRowActions } from '@/components/financial-accounts/AccountRowActions.jsx';
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns.js';
import { NewAccountWizard } from '@/windows/custom/financial-account/NewAccountWizard.jsx';
import { EditAccountModal } from '@/windows/custom/financial-account/EditAccountModal.jsx';
import { ArchiveAccountDialog } from '@/windows/custom/financial-account/ArchiveAccountDialog.jsx';
import { BankConnectionFlowUI } from '@/windows/custom/financial-account/BankConnectionFlowUI.jsx';
import { FundsTransferModal } from '@/windows/custom/financial-account/FundsTransferModal.jsx';
import { ConfirmDialog } from '@/components/OAuth2ClientDialog';
import BankConnectionDeleteConfirmModal from '@/windows/custom/financial-account/BankConnectionDeleteConfirmModal.jsx';

/* eslint-disable react/prop-types */

// Per-column presentation the contract cannot express: the Figma layout pins these
// widths, and `pl-[84px]` aligns the "Cuenta" header with the row avatar. Consumed
// through DataTable's `col.headClass` / `col.cellClass`.
// Stays in code, not in decisions.json, for three reasons: decisions is a semantic
// contract rather than a stylesheet; Tailwind arbitrary values must be static in
// source, so a runtime `w-[${n}px]` would never be compiled; and `pl-[84px]` is not
// a width at all — it mirrors NameCell's 44px grip + 32px avatar + 8px padding, so
// it is coupled to that cell body and has to move with it.
const COLUMN_CHROME = {
  name: { headClass: 'w-[480px] pl-[84px] pr-2', cellClass: 'w-[480px] p-0' },
  type: { headClass: 'w-[340px] px-2', cellClass: 'w-[340px] px-2 py-2' },
  currentBalance: { headClass: 'w-[200px] px-2', cellClass: 'w-[200px] px-2' },
  pendingCount: { headClass: 'w-[280px] px-2', cellClass: 'w-[280px] px-2' },
};

// DataTable right-aligns any column whose `type` is in its NUMERIC_FIELD_TYPES set
// (header AND cell, independent of `render`). `pendingCount` is typed "integer" in
// the contract because it IS a count, but it never displays that count as a number —
// it always renders through `reconcilePill` (the "Conciliado" / "Conciliar (N)" pill),
// so the numeric right-align only pushed the two pill variants to inconsistent left
// edges instead of the plain left-aligned column every other status cell uses.
// Overriding the type here is presentation-only: the column stays non-sortable and
// non-form (`grid`-only), so nothing about validation, editing, or the underlying
// contract type is affected — see DataTable.jsx's NUMERIC_FIELD_TYPES / `col.type`.
const GRID_TYPE_OVERRIDE = {
  pendingCount: 'string',
};

/**
 * The list's columns in DataTable's `columns` shape.
 *
 * Everything about the DATA columns is declared in
 * `artifacts/financial-account/decisions.json` and read back off the contract:
 * which ones appear (`grid`), their order (`gridOrder`), their header
 * (`gridLabelKey`) and their renderer (`cellType`, resolved through
 * ACCOUNT_CELL_TYPES). "Por conciliar" is a `virtualFields[]` entry — the handler
 * injects `pendingCount` in afterHandle, there is no AD column behind it.
 *
 * Only the trailing actions column is appended here: its declarative equivalent
 * (`rowQuickActions`) renders an absolute hover overlay rather than a column, and
 * every action opens a local modal.
 */
function buildColumns(ui, locale, handlers) {
  const cellCtx = {
    ui,
    onConnect: (account) => handlers.onBankConnectionAction('connect', account),
    onReconcile: handlers.onReconcile,
  };

  const dataColumns = getContractGridColumns('account').map((col) => {
    const renderer = ACCOUNT_CELL_TYPES[resolveCellType(col)];
    return {
      key: col.name,
      column: col.column,
      type: GRID_TYPE_OVERRIDE[col.name] ?? col.type,
      // `labels[locale]` is resolveColumnLabel's top-priority branch, so a declared
      // gridLabelKey wins over the AD dictionary. Without one, `column` lets the
      // dictionary resolve it rather than falling through to the raw field name.
      labels: col.gridLabelKey ? { [locale]: ui(col.gridLabelKey) } : undefined,
      label: col.label,
      sortable: false,
      ...(COLUMN_CHROME[col.name] ?? {}),
      render: renderer ? (row) => renderer(row, cellCtx) : undefined,
    };
  });

  return [
    ...dataColumns,
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
            onBankConnectionAction={handlers.onBankConnectionAction}
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

export default function AccountsHeaderTable({
  data,
  meta,
  onDataMutated,
  // ETP-4656 — ListView's authoritative selection (read-only here). Destructured out of
  // `props` only so it does not travel into DataTable, where `selectedRows` is the name
  // of local state and would read as a controlled-selection prop it does not have.
  selectedRows,
  ...props
}) {
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
  const [deleteConnectionTarget, setDeleteConnectionTarget] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const reload = () => onDataMutated?.();

  // ETP-4656 — the selection bar ListView renders above this slot REPLACES the toolbar
  // rather than stacking on top of it (the standardized delete UX). ListView renders that
  // bar as a sibling and cannot reach inside the slot, so the swap happens here.
  //
  // Derived straight from ListView's own state — deliberately NOT mirrored into local
  // state off `onSelectionChange`. DataTable empties/prunes its internal selection Set
  // silently from its `clearSelectionTrigger` / `deselectTrigger` effects without calling
  // `onSelectionChange`, so a local mirror would still read "selected" after a successful
  // bulk delete or a cancel, and the toolbar would never come back.
  const selectionActive = (selectedRows?.length ?? 0) > 0;
  const { sync, disconnect, reconnect, finishReconnect } = useBankConnectionActions();
  const bankConnectionFlow = useBankConnectionFlow({ onDone: reload });


  const handleBankConnectionAction = async (action, account) => {
    if (action === 'connect') {
      bankConnectionFlow.startConnect(account);
      return;
    }
    if (action === 'syncNow') {
      try {
        const res = await sync(account.id);
        reload();
        const msg = res?.message;
        if (res?.status === 'ERROR') {
          toast.error(msg || ui('financeAccountsBankConnectionSyncError'));
        } else if (res?.status === 'WARNING') {
          toast.info(msg || ui('financeAccountsBankConnectionSyncDone'));
        } else {
          toast.success(msg || ui('financeAccountsBankConnectionSyncDone'));
        }
      } catch (err) {
        toast.error(err.message || ui('financeAccountsBankConnectionSyncError'));
      }
      return;
    }
    if (action === 'reconnect') {
      // Same popup handshake the edit modal's Reconectar uses — this revives the deactivated
      // connection rather than creating a new one through the connect wizard. The follow-up
      // `finishReconnect` is what actually reactivates it: Salt Edge redirects to an app route
      // that only relays the connection id, so nothing else would flip it back to active.
      try {
        const connectionId = await launchSaltEdgePopup(() => reconnect(account.id));
        if (!connectionId) return;
        await finishReconnect(account.id, connectionId);
        reload();
        toast.success(ui('financeAccountsBankConnectionReauthDone'));
      } catch (err) {
        toast.error(err.message === 'BANK_CONNECTION_TIMEOUT'
          ? ui('financeAccountsBankConnectionTimeout')
          : err.message);
      }
      return;
    }
    if (action === 'disconnect') {
      setDisconnectTarget(account);
      return;
    }
    if (action === 'deleteConnection') {
      setDeleteConnectionTarget(account);
    }
  };

  /**
   * Runs the disconnect for whichever confirmation is open. The soft path only deactivates the
   * connection (it stays reconnectable); the permanent one deletes it at the bank provider.
   * The success message reports what the bridge says actually happened, since a connection
   * shared with other accounts is always unlinked even when a soft disconnect was requested.
   */
  const runDisconnect = async (account, permanentDeletion, clearTarget) => {
    if (!account) return;
    setDisconnecting(true);
    try {
      const res = await disconnect(account.id, { permanentDeletion });
      const wasPermanent = res?.permanent ?? permanentDeletion;
      toast.success(ui(wasPermanent
        ? 'financeAccountsBankConnectionDeleteDone'
        : 'financeAccountsBankConnectionDisconnectDone'));
      clearTarget();
      reload();
    } catch (err) {
      toast.error(err.message || ui(permanentDeletion
        ? 'financeAccountsBankConnectionDeleteError'
        : 'financeAccountsBankConnectionDisconnectError'));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleConfirmDisconnect = () => runDisconnect(
    disconnectTarget, false, () => setDisconnectTarget(null),
  );

  const handleConfirmDeleteConnection = () => runDisconnect(
    deleteConnectionTarget, true, () => setDeleteConnectionTarget(null),
  );

  const handlers = {
    onOpen: (account) => navigate(`/financial-account/${account.id}`),
    onReconcile: (account) => navigate(`/financial-account/${account.id}?tab=reconciliation&autoMatch=true`),
    onNewMovement: (account) => navigate(`/financial-account/${account.id}?tab=movements&newMovement=true`),
    onEdit: setEditAccount,
    onArchive: setArchiveTarget,
    onTransfer: setTransferSource,
    onBankConnectionAction: handleBankConnectionAction,
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
      {/* Fixed: toolbar. Unmounted (not merely hidden) while a selection is active, so
          `cuentas-toolbar` genuinely leaves the DOM and ListView's selection bar above
          reads as its replacement. The type filter and the search text are held in this
          component's state, so they survive the unmount and are still applied when the
          selection clears. */}
      {!selectionActive && (
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
      )}

      {/* min-h-0 lets the flex child actually shrink so the inner overflow engages */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Fixed: KPI sidebar (brings its own w-[292px] shrink-0) */}
        <AccountsSidebar summary={meta?.summary ?? null} loading={false} data-testid="AccountsSidebar__accthdr" />

        {/* Vertical rule between the KPI panel and the rows, as in the original page */}
        <div className="w-px self-stretch bg-[hsl(var(--border-subtle))]" aria-hidden="true" />
        {/* The only scrolling region. The room the elevated hover shadow needs under the
            last row is reserved by DataTable itself, not here. */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'auto' }}>
          <DataTable
            {...props}
            data={visibleAccounts}
            columns={columns}
            // DataTable calls this with the whole ROW, not an id (DataTable.jsx:1902,
            // `onNavigate(row)`). Taking it as an id produced /financial-account/[object Object].
            onNavigate={(row) => handlers.onOpen(row)}
            onDataMutated={onDataMutated}
            // Load-bearing: DataTable totals every `amount` column, and summing
            // balances across currencies without conversion is a wrong number.
            showFooterTotals={false}
            // ETP-4656 — `selectable` is deliberately LEFT AT DataTable's default (true)
            // so the checkbox column renders and ListView's standardized selection bar
            // ("Delete selected") becomes reachable. A hardcoded `selectable={false}`
            // here is what removed grid multi-select delete from this window; the story's
            // scope table requires it (Cuentas financieras: F/GH/GM all ✅).
            // Independently of selection, the hover quick-actions overlay stays
            // suppressed declaratively (`window.rowQuickActions.enabled: false` in
            // decisions.json), since this list owns its per-row actions through the
            // trailing AccountRowActions column.
            //
            // Selection STATE stays ListView's, untouched: `onSelectionChange` (its own
            // `setSelectedRows`) plus `clearSelectionTrigger` / `deselectTrigger` /
            // `deselectRowIds` all reach DataTable through the `{...props}` spread above.
            // Nothing about selection is overridden here — this slot only READS
            // `selectedRows` to decide whether its toolbar is on screen.
            // The retired page lifted the hovered row with a drop shadow instead of
            // tinting it (`hover:z-10 hover:shadow-lg` on AccountRow's <tr>). Keeping
            // that reading — the row as a raised card — is why DataTable takes a
            // hover style rather than this slot restyling rows on its own.
            rowHoverStyle="elevated"
            data-testid="DataTable__accthdr" />
        </div>
      </div>

      <NewAccountWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={reload}
        onConnectWithCreation={bankConnectionFlow.startCreate}
        data-testid="NewAccountWizard__accthdr" />
      <EditAccountModal
        open={!!editAccount}
        account={editAccount}
        onClose={() => setEditAccount(null)}
        onSaved={reload}
        onArchive={(acc) => { setEditAccount(null); setArchiveTarget(acc); }}
        onConnect={(acc) => { setEditAccount(null); handleBankConnectionAction('connect', acc); }}
        data-testid="EditAccountModal__accthdr" />
      <ArchiveAccountDialog
        open={!!archiveTarget}
        account={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={reload}
        data-testid="ArchiveAccountDialog__accthdr" />
      {/* `...DisconnectConfirm` ("Disconnect this bank connection?") is the dialog's title,
          not a button label — despite the name. `...DisconnectAction` ("Disconnect") is the
          confirm button, and `...DisconnectBody` explains that this only deactivates the
          connection, keeping it reconnectable. */}
      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(o) => { if (!o) setDisconnectTarget(null); }}
        title={ui('financeAccountsBankConnectionDisconnectConfirm')}
        description={ui('financeAccountsBankConnectionDisconnectBody')}
        confirmLabel={ui('financeAccountsBankConnectionDisconnectAction')}
        cancelLabel={ui('cancel')}
        loading={disconnecting}
        onConfirm={handleConfirmDisconnect}
        data-testid="ConfirmDialog__accthdr" />
      {/* The irreversible half gets the full warning cartel, same as in the edit modal. */}
      {deleteConnectionTarget ? (
        <BankConnectionDeleteConfirmModal
          onConfirm={handleConfirmDeleteConnection}
          onClose={() => setDeleteConnectionTarget(null)}
          data-testid="BankConnectionDeleteConfirmModal__accthdr" />
      ) : null}
      {transferSource && (
        <FundsTransferModal
          open
          sourceAccountId={transferSource.id}
          onClose={() => setTransferSource(null)}
          onDone={reload}
          data-testid="FundsTransferModal__accthdr" />
      )}
      <BankConnectionFlowUI flow={bankConnectionFlow} data-testid="BankConnectionFlowUI__accthdr" />
    </div>
  );
}
