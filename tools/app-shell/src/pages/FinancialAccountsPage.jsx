import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useUI } from '@/i18n';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts.js';
import { usePsd2Actions } from '@/hooks/usePsd2Actions.js';
import { usePsd2ConnectFlow } from '@/hooks/usePsd2ConnectFlow.js';
import {
  AccountsSidebar,
  AccountsToolbar,
  AccountsTable,
  AccountTypeFilter,
} from '@/components/financial-accounts';
import { NewAccountWizard } from '@/windows/custom/financial-account/NewAccountWizard.jsx';
import { EditAccountModal } from '@/windows/custom/financial-account/EditAccountModal.jsx';
import { ArchiveAccountDialog } from '@/windows/custom/financial-account/ArchiveAccountDialog.jsx';
import { Psd2ConnectFlowUI } from '@/windows/custom/financial-account/Psd2ConnectFlowUI.jsx';
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
      // eslint-disable-next-line no-alert
      if (!window.confirm(ui('financeAccountsPsd2DisconnectConfirm'))) return;
      try {
        await disconnect(account.id);
        toast.success(ui('financeAccountsPsd2DisconnectDone'));
        reload();
      } catch (err) {
        toast.error(err.message || ui('financeAccountsPsd2DisconnectError'));
      }
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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="border-b border-[#E8EAEF] p-2">
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

        <div className="w-px self-stretch bg-[#E8EAEF]" aria-hidden="true" />

        <div className="flex flex-1 flex-col overflow-hidden">
          <AccountsTable
            accounts={visibleAccounts}
            loading={loading}
            error={error}
            onOpen={handleOpenAccount}
            onReconcile={handleReconcile}
            onEdit={setEditAccount}
            onArchive={setArchiveTarget}
            onPsd2Action={handlePsd2Action}
            onTransfer={setTransferSource}
            onRetry={reload}
            data-testid="AccountsTable__7c3fbc" />
        </div>
      </div>
      <NewAccountWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={reload}
        onConnectWithCreation={psd2Flow.startCreate}
        data-testid="NewAccountWizard__7c3fbc" />
      <EditAccountModal
        open={!!editAccount}
        account={editAccount}
        onClose={() => setEditAccount(null)}
        onSaved={reload}
        onArchive={(acc) => { setEditAccount(null); setArchiveTarget(acc); }}
        onConnect={(acc) => { setEditAccount(null); handlePsd2Action('connect', acc); }}
        data-testid="EditAccountModal__7c3fbc" />
      <ArchiveAccountDialog
        open={!!archiveTarget}
        account={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={reload}
        data-testid="ArchiveAccountDialog__7c3fbc" />
      <Psd2ConnectFlowUI flow={psd2Flow} data-testid="Psd2ConnectFlowUI__7c3fbc" />
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
