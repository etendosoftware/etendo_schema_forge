// Hover row actions for the Cuentas list: edit, bank connection sync (connected
// accounts only) and the kebab menu.
//
// Extracted from the retired AccountRow (ETP-4658) so the testids and the
// sync-visibility rule have a single definition; the generic DataTable renders them
// inside its shared sticky `rowQuickActions` cell in AccountsHeaderTable.
import { Pencil, RefreshCw } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUI } from '@/i18n';
import { AccountRowMenu } from './AccountRowMenu.jsx';

export function AccountRowActions({
  account,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
  onBankConnectionAction,
  onTransfer,
  onNewMovement,
}) {
  const ui = useUI();

  return (
    <TooltipProvider data-testid="TooltipProvider__acctactions">
      {/* DataTable owns the shared sticky-right cell and its hover background. This
          container mirrors RowQuickActions' positioning inside that cell so Financial
          Accounts gets the same viewport-edge alignment and instant reveal while
          retaining its domain-specific Sync button and bank menu. The named group
          variant is load-bearing; the unnamed one keeps compatibility with a plain
          `group` host. */}
      <div className="absolute right-0 inset-y-0 z-10 flex h-full flex-row items-center justify-center gap-0.5 px-3 opacity-0 group-hover:opacity-100 group-hover/row:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
        <Tooltip delayDuration={0} data-testid="Tooltip__acctactions">
          <TooltipTrigger asChild data-testid="TooltipTrigger__acctactions">
            <button
              type="button"
              aria-label={ui('financeAccountsMenuEdit')}
              data-testid={`account-row-edit-${account.id}`}
              onClick={() => onEdit?.(account)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--border-subtle))]"
            >
              <Pencil className="h-5 w-5" data-testid="Pencil__acctactions" />
            </button>
          </TooltipTrigger>
          <TooltipContent data-testid="TooltipContent__acctactions">{ui('financeAccountsMenuEdit')}</TooltipContent>
        </Tooltip>
        {/* Sync is only meaningful for bank-connected accounts — same statement fetch as the
            kebab's "Sincronizar ahora" / the statements tab's "Sincronizar extractos". */}
        {account.bankConnected === true ? (
          <Tooltip delayDuration={0} data-testid="Tooltip__acctactions">
            <TooltipTrigger asChild data-testid="TooltipTrigger__acctactions">
              <button
                type="button"
                aria-label={ui('financeAccountsMenuSyncNow')}
                data-testid={`account-row-refresh-${account.id}`}
                onClick={() => onBankConnectionAction?.('syncNow', account)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--border-subtle))]"
              >
                <RefreshCw className="h-5 w-5" data-testid="RefreshCw__acctactions" />
              </button>
            </TooltipTrigger>
            <TooltipContent data-testid="TooltipContent__acctactions">{ui('financeAccountsMenuSyncNow')}</TooltipContent>
          </Tooltip>
        ) : null}
        <AccountRowMenu
          account={account}
          onOpen={onOpen}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
          onBankConnectionAction={onBankConnectionAction}
          onTransfer={onTransfer}
          onNewMovement={onNewMovement}
          data-testid="AccountRowMenu__acctactions" />
      </div>
    </TooltipProvider>
  );
}
