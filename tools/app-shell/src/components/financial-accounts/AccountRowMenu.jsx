import {
  MoreVertical,
  ExternalLink,
  Pencil,
  Archive,
  RefreshCw,
  Unlink2,
  Plug,
  ArrowLeftRight,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useUI } from '@/i18n';
import { ACCOUNT_TYPE } from './tokens';

/**
 * Per-row kebab menu. Shows every action available on a financial account so
 * the surface matches the Figma `3012:25602` mock end-to-end, even before the
 * downstream features ship. Items follow this order:
 *
 *   1. Abrir cuenta             (navigates to the detail)
 *   2. Editar cuenta            (opens the unified edit modal — includes the bank
 *                                connection panel when connected, ETP-4097 / T3)
 *   3. Sincronizar ahora        (connected only — runs the bank statement fetch)
 *   ───
 *   4. Desconectar banco         (connected only — deactivates, stays reconnectable)
 *   4'. Reconectar               (soft-disconnected only — revives the surviving link)
 *   4''. Conectar banco          (no bank link at all)
 *   5. Borrar conexión           (any bank link — irreversible, ETP-4764)
 *
 * The former standalone "Editar conexión bancaria" item was merged into "Editar
 * cuenta": both surfaced the same account data, so editing is now unified.
 * Cash accounts (type=C) never expose the bank connection group because the connection
 * does not apply to manual cash drawers.
 */
export function AccountRowMenu({ account, onOpen, onEdit, onArchive, onBankConnectionAction, onTransfer, onNewMovement }) {
  const ui = useUI();
  const isCash = account.type === ACCOUNT_TYPE.CASH;
  const bankConnected = account.bankConnected === true;
  // Soft-disconnected: not connected, but the bank link survives and can be revived.
  const bankReconnectable = account.bankReconnectable === true;

  return (
    <DropdownMenu data-testid="DropdownMenu__ffaf9f">
      <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__ffaf9f">
        <button
          type="button"
          aria-label={ui('financeAccountsRowMenuLabel')}
          data-testid={`account-row-menu-trigger-${account.id}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--border-subtle))]"
        >
          <MoreVertical className="h-5 w-5" data-testid="MoreVertical__ffaf9f" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[235px]"
        data-testid="DropdownMenuContent__ffaf9f">
        <DropdownMenuItem
          onClick={() => onOpen?.(account)}
          data-testid={`account-row-menu-open-${account.id}`}
        >
          <ExternalLink className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="ExternalLink__ffaf9f" />
          <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
            {ui('financeAccountsMenuOpen')}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onEdit?.(account)}
          data-testid={`account-row-menu-edit-${account.id}`}
        >
          <Pencil className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="Pencil__ffaf9f" />
          <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
            {ui('financeAccountsMenuEdit')}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onNewMovement?.(account)}
          data-testid={`account-row-menu-new-movement-${account.id}`}
        >
          <Plus className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="Plus__ffaf9f" />
          <span className="text-sm font-normal leading-6 text-[hsl(var(--text-primary))]">
            {ui('financeAccountTxNewAction')}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onTransfer?.(account)}
          data-testid={`account-row-menu-transfer-${account.id}`}
        >
          <ArrowLeftRight className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="ArrowLeftRight__ffaf9f" />
          <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
            {ui('financeAccountTransferAction')}
          </span>
        </DropdownMenuItem>

        {!isCash ? (
          <>
            {bankConnected ? (
              <>
                <DropdownMenuItem
                  onClick={() => onBankConnectionAction?.('syncNow', account)}
                  data-testid={`account-row-menu-sync-${account.id}`}
                >
                  <RefreshCw className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="RefreshCw__ffaf9f" />
                  <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
                    {ui('financeAccountsMenuSyncNow')}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator data-testid="DropdownMenuSeparator__ffaf9f" />
                <DropdownMenuItem
                  onClick={() => onBankConnectionAction?.('disconnect', account)}
                  data-testid={`account-row-menu-disconnect-${account.id}`}
                >
                  <Unlink2 className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="Unlink2__ffaf9f" />
                  <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
                    {ui('financeAccountsMenuDisconnect')}
                  </span>
                </DropdownMenuItem>
              </>
            ) : null}

            {/* Soft-disconnected: the link survives, so offer to revive it rather than a
                from-scratch connect, which would orphan the existing connection. */}
            {!bankConnected && bankReconnectable ? (
              <>
                <DropdownMenuItem
                  onClick={() => onBankConnectionAction?.('reconnect', account)}
                  data-testid={`account-row-menu-reconnect-${account.id}`}
                >
                  <RefreshCw className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="RefreshCwReconnect__ffaf9f" />
                  <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
                    {ui('financeAccountsBankConnectionReconnect')}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator data-testid="DropdownMenuSeparator__ffaf9f" />
              </>
            ) : null}

            {!bankConnected && !bankReconnectable ? (
              <DropdownMenuItem
                onClick={() => onBankConnectionAction?.('connect', account)}
                data-testid={`account-row-menu-connect-${account.id}`}
              >
                <Plug className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="Plug__ffaf9f" />
                <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
                  {ui('financeAccountsMenuConnect')}
                </span>
              </DropdownMenuItem>
            ) : null}

            {/* Permanent deletion is offered wherever a bank link exists — live or deactivated. */}
            {bankConnected || bankReconnectable ? (
              <DropdownMenuItem
                onClick={() => onBankConnectionAction?.('deleteConnection', account)}
                data-testid={`account-row-menu-delete-connection-${account.id}`}
              >
                <Trash2 className="h-5 w-5 text-[hsl(var(--destructive))]" data-testid="Trash2__ffaf9f" />
                <span className="text-sm font-normal leading-6 text-[hsl(var(--destructive))]">
                  {ui('financeAccountsBankConnectionDeleteAction')}
                </span>
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}

        <DropdownMenuSeparator data-testid="DropdownMenuSeparator__ffaf9f" />
        <DropdownMenuItem
          onClick={() => onArchive?.(account)}
          data-testid={`account-row-menu-archive-${account.id}`}
        >
          <Archive className="h-5 w-5 text-[hsl(var(--destructive))]" data-testid="Archive__ffaf9f" />
          <span className="text-sm font-normal leading-6 text-[hsl(var(--destructive))]">
            {ui('financeAccountsMenuArchive')}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
