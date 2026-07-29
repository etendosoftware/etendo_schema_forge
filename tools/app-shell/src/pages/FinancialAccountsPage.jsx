import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useUI } from '@/i18n';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts.js';
import { useBankConnectionActions } from '@/hooks/useBankConnectionActions.js';
import { useBankConnectionFlow } from '@/hooks/useBankConnectionFlow.js';
import {
  AccountsSidebar,
  AccountsToolbar,
  AccountsTable,
  AccountTypeFilter,
} from '@/components/financial-accounts';
import { NewAccountWizard } from '@/windows/custom/financial-account/NewAccountWizard.jsx';
import { EditAccountModal } from '@/windows/custom/financial-account/EditAccountModal.jsx';
import { ArchiveAccountDialog } from '@/windows/custom/financial-account/ArchiveAccountDialog.jsx';
import { ConfirmDialog } from '@/components/OAuth2ClientDialog';
import { BankConnectionFlowUI } from '@/windows/custom/financial-account/BankConnectionFlowUI.jsx';
import { FundsTransferModal } from '@/windows/custom/financial-account/FundsTransferModal.jsx';

function filterAccounts(accounts, typeFilter, search) {
  if (!Array.isArray(accounts)) return [];
  const needle = (search ?? '').trim().toLowerCase();
  const inactiveView = typeFilter === AccountTypeFilter.INACTIVE;
  return accounts.filter((account) => {
    const isActive = account.active !== false;
    if (inactiveView) {
      // "Inactivas": every archived account, regardless of type.
      if (isActive) return false;
    } else {
      // Normal views hide archived accounts and filter by type.
      if (!isActive) return false;
      if (typeFilter && account.type !== typeFilter) return false;
    }
    if (!needle) return true;
    return [account.name, account.iban, account.currencyIso]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle));
  });
}

export default function FinancialAccountsPage() {
  const ui = useUI();
  const navigate = useNavigate();
  const { accounts, summary, loading, error, reload } = useFinancialAccounts();
  const [typeFilter, setTypeFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [transferSource, setTransferSource] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const { sync, disconnect } = useBankConnectionActions();
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
    if (action === 'disconnect') {
      // Styled confirmation dialog (matches the app's other confirm modals) instead of the
      // native window.confirm.
      setDisconnectTarget(account);
    }
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    try {
      await disconnect(disconnectTarget.id);
      toast.success(ui('financeAccountsBankConnectionDisconnectDone'));
      setDisconnectTarget(null);
      reload();
    } catch (err) {
      toast.error(err.message || ui('financeAccountsBankConnectionDisconnectError'));
    } finally {
      setDisconnecting(false);
    }
  };

  // The header badge counts active accounts only (archived ones live behind the
  // dedicated "inactive" filter and shouldn't inflate the headline figure).
  const activeCount = useMemo(
    () => accounts.filter((a) => a.active !== false).length,
    [accounts],
  );

  useSetPageMeta({
    title: ui('financeAccountsPageTitle'),
    breadcrumb: `${ui('financeMenuLabel')} / ${ui('financeAccountsPageTitle')}`,
    recordCount: activeCount,
  }, [activeCount]);

  const visibleAccounts = useMemo(
    () => filterAccounts(accounts, typeFilter, search),
    [accounts, typeFilter, search],
  );

  const handleOpenAccount = (account) => {
    navigate(`/financial-account/${account.id}`);
  };

  const handleReconcile = (account) => {
    navigate(`/financial-account/${account.id}?tab=reconciliation&autoMatch=true`);
  };

  // "Nuevo movimiento" from the accounts grid opens the account detail's Movements
  // tab with the New-movement modal auto-opened (the modal needs the account's
  // currency + header dimensions, which the detail view loads).
  const handleNewMovement = (account) => {
    navigate(`/financial-account/${account.id}?tab=movements&newMovement=true`);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="border-b border-[hsl(var(--border-subtle))] p-2">
        <AccountsToolbar
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          search={search}
          onSearchChange={setSearch}
          onNewAccount={() => setWizardOpen(true)}
          onMatchingRules={() => navigate('/match-rule')}
          data-testid="AccountsToolbar__7c3fbc" />
      </div>
      <div
        className="flex flex-1 overflow-hidden"
        data-testid="cuentas-card"
      >
        <AccountsSidebar summary={summary} loading={loading} data-testid="AccountsSidebar__7c3fbc" />

        <div className="w-px self-stretch bg-[hsl(var(--border-subtle))]" aria-hidden="true" />

        <div className="flex flex-1 flex-col overflow-hidden">
          <AccountsTable
            accounts={visibleAccounts}
            loading={loading}
            error={error}
            onOpen={handleOpenAccount}
            onReconcile={handleReconcile}
            onEdit={setEditAccount}
            onArchive={setArchiveTarget}
            onBankConnectionAction={handleBankConnectionAction}
            onTransfer={setTransferSource}
            onNewMovement={handleNewMovement}
            onRetry={reload}
            data-testid="AccountsTable__7c3fbc" />
        </div>
      </div>
      <NewAccountWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={reload}
        onConnectWithCreation={bankConnectionFlow.startCreate}
        data-testid="NewAccountWizard__7c3fbc" />
      <EditAccountModal
        open={!!editAccount}
        account={editAccount}
        onClose={() => setEditAccount(null)}
        onSaved={reload}
        onArchive={(acc) => { setEditAccount(null); setArchiveTarget(acc); }}
        onConnect={(acc) => { setEditAccount(null); handleBankConnectionAction('connect', acc); }}
        data-testid="EditAccountModal__7c3fbc" />
      <ArchiveAccountDialog
        open={!!archiveTarget}
        account={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={reload}
        data-testid="ArchiveAccountDialog__7c3fbc" />
      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(o) => { if (!o) setDisconnectTarget(null); }}
        title={ui('financeAccountsMenuDisconnect')}
        description={ui('financeAccountsBankConnectionDisconnectConfirm')}
        confirmLabel={ui('financeAccountsBankConnectionDisconnectAction')}
        cancelLabel={ui('cancel')}
        variant="destructive"
        loading={disconnecting}
        onConfirm={handleConfirmDisconnect}
        data-testid="DisconnectBankConfirmDialog__7c3fbc" />
      <BankConnectionFlowUI flow={bankConnectionFlow} data-testid="BankConnectionFlowUI__7c3fbc" />
      {transferSource ? (
        <FundsTransferModal
          sourceAccountId={transferSource.id}
          onClose={() => setTransferSource(null)}
          onSuccess={reload}
          data-testid="FundsTransferModal__7c3fbc" />
      ) : null}
    </div>
  );
}
