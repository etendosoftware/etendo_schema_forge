// Hover row actions for the Cuentas list: edit, bank connection sync (connected
// accounts only) and the kebab menu.
//
// Extracted from the retired AccountRow (ETP-4658) so the testids and the
// sync-visibility rule have a single definition; the generic DataTable renders them
// inside its shared sticky `rowQuickActions` cell in AccountsHeaderTable.
import { Pencil } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUI } from '@/i18n';
import { useBankSyncStatus } from '@/windows/custom/financial-account/BankSyncContext.jsx';
import { AccountRowMenu } from './AccountRowMenu.jsx';
import { BankSyncIcon } from './BankSyncIcon.jsx';

// ETP-6154 — the BankSyncIcon badge's backdrop has to match whatever is behind the button so the
// badge reads as cut out of the bank: the hovered row's tint (DataTable publishes it as
// `--row-hover-bg`; these actions are only visible while the row is hovered), or the button's own
// hover disc. Disabled (sync running), the button has no hover disc, so the row tint stays.
const ROW_SYNC_BADGE_BG = 'bg-[var(--row-hover-bg,hsl(var(--card)))] group-hover/sync:bg-[hsl(var(--border-subtle))] group-disabled/sync:bg-[var(--row-hover-bg,hsl(var(--card)))]';

export function AccountRowActions({
  account,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
  onBankConnectionAction,
  onTransfer,
  onNewMovement,
  // ETP-5457 — the window's "read-only" access tier: Edit and Sync (both writes) are not
  // rendered, and the kebab keeps only its navigation item ("Abrir cuenta").
  windowReadOnly = false,
}) {
  const ui = useUI();
  const { syncing } = useBankSyncStatus(account.id);
  const syncLabel = ui(syncing ? 'financeAccountsBankSyncInProgress' : 'financeAccountsBankSyncTooltip');

  return (
    <TooltipProvider data-testid="TooltipProvider__acctactions">
      {/* DataTable owns the shared sticky-right cell and its hover background. This
          container mirrors RowQuickActions' positioning inside that cell so Financial
          Accounts gets the same viewport-edge alignment and instant reveal while
          retaining its domain-specific Sync button and bank menu. The named group
          variant is load-bearing; the unnamed one keeps compatibility with a plain
          `group` host. */}
      <div className="absolute right-0 inset-y-0 z-10 flex h-full flex-row items-center justify-center gap-0.5 px-3 opacity-0 group-hover:opacity-100 group-hover/row:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
        {!windowReadOnly && (
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
        )}
        {/* Sync is only meaningful for bank-connected accounts — same statement fetch as the
            kebab's "Sincronizar ahora" / the statements tab's "Sincronizar extractos".
            ETP-6154: while a sync of this account runs (from ANY entry point — the shared
            BankSyncContext), the button is disabled with its badge spinning. The trigger is a
            wrapper span because a disabled button fires no pointer events, which would keep the
            "in progress" tooltip from ever showing. */}
        {!windowReadOnly && account.bankConnected === true ? (
          <Tooltip delayDuration={0} data-testid="Tooltip__acctactions">
            <TooltipTrigger asChild data-testid="TooltipTrigger__acctactions">
              <span className="inline-flex" data-testid={`account-row-refresh-wrap-${account.id}`}>
                <button
                  type="button"
                  aria-label={syncLabel}
                  aria-busy={syncing}
                  disabled={syncing}
                  data-testid={`account-row-refresh-${account.id}`}
                  onClick={() => onBankConnectionAction?.('syncNow', account)}
                  className="group/sync inline-flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--border-subtle))] disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <BankSyncIcon
                    spinning={syncing}
                    className="h-5 w-5"
                    badgeClassName={ROW_SYNC_BADGE_BG}
                    data-testid={`account-row-refresh-icon-${account.id}`} />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent data-testid="TooltipContent__acctactions">{syncLabel}</TooltipContent>
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
          windowReadOnly={windowReadOnly}
          data-testid="AccountRowMenu__acctactions" />
      </div>
    </TooltipProvider>
  );
}
