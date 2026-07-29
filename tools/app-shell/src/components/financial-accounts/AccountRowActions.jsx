// Hover row actions for the Cuentas list: edit, PSD2 sync (connected accounts
// only) and the kebab menu.
//
// Extracted from AccountRow so the same actions can be rendered by the generic
// DataTable (via a `col.render` synthetic column in AccountsHeaderTable) and by
// the legacy hand-rolled AccountsTable, with one definition of the testids and
// the sync-visibility rule.
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
  onPsd2Action,
  onTransfer,
  onNewMovement,
}) {
  const ui = useUI();

  return (
    <TooltipProvider data-testid="TooltipProvider__acctactions">
      {/* Two hover groups on purpose: the legacy AccountsTable marks its row with a
          plain `group`, while the generic DataTable uses the NAMED `group/row`
          (DataTable.jsx:1201). Without the named variant the actions stayed invisible
          in the generated list. */}
      <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-hover/row:opacity-100">
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
        {/* Sync is only meaningful for PSD2-connected accounts — same statement fetch as the
            kebab's "Sincronizar ahora" / the statements tab's "Sincronizar extractos". */}
        {account.psd2Connected === true ? (
          <Tooltip delayDuration={0} data-testid="Tooltip__acctactions">
            <TooltipTrigger asChild data-testid="TooltipTrigger__acctactions">
              <button
                type="button"
                aria-label={ui('financeAccountsMenuSyncNow')}
                data-testid={`account-row-refresh-${account.id}`}
                onClick={() => onPsd2Action?.('syncNow', account)}
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
          onPsd2Action={onPsd2Action}
          onTransfer={onTransfer}
          onNewMovement={onNewMovement}
          data-testid="AccountRowMenu__acctactions" />
      </div>
    </TooltipProvider>
  );
}
