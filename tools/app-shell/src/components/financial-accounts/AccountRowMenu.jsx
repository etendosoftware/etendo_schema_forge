import {
  MoreVertical,
  ExternalLink,
  Pencil,
  Archive,
  RefreshCw,
  Unlink2,
  Plug,
  ArrowLeftRight,
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
 *   2. Editar cuenta            (opens the unified edit modal — includes the PSD2
 *                                connection panel when connected, ETP-4097 / T3)
 *   3. Sincronizar ahora        (connected only — runs the PSD2 statement fetch)
 *   ───
 *   4. Desconectar PSD2         (connected only)
 *   4'. Conectar PSD2           (not connected)
 *
 * The former standalone "Editar conexión PSD2" item was merged into "Editar
 * cuenta": both surfaced the same account data, so editing is now unified.
 * Cash accounts (type=C) never expose the PSD2 group because the connection
 * does not apply to manual cash drawers.
 */
export function AccountRowMenu({ account, onOpen, onEdit, onArchive, onPsd2Action, onTransfer }) {
  const ui = useUI();
  const isCash = account.type === ACCOUNT_TYPE.CASH;
  const psd2Connected = account.psd2Connected === true;

  return (
    <DropdownMenu data-testid="DropdownMenu__ffaf9f">
      <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__ffaf9f">
        <button
          type="button"
          aria-label={ui('financeAccountsRowMenuLabel')}
          data-testid={`account-row-menu-trigger-${account.id}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#828FA3] hover:bg-[#E8EAEF]"
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
          <ExternalLink className="h-5 w-5 text-[#828FA3]" data-testid="ExternalLink__ffaf9f" />
          <span className="text-sm font-normal leading-6 text-[#121217]">
            {ui('financeAccountsMenuOpen')}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onEdit?.(account)}
          data-testid={`account-row-menu-edit-${account.id}`}
        >
          <Pencil className="h-5 w-5 text-[#828FA3]" data-testid="Pencil__ffaf9f" />
          <span className="text-sm font-normal leading-6 text-[#121217]">
            {ui('financeAccountsMenuEdit')}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onTransfer?.(account)}
          data-testid={`account-row-menu-transfer-${account.id}`}
        >
          <ArrowLeftRight className="h-5 w-5 text-[#828FA3]" data-testid="ArrowLeftRight__ffaf9f" />
          <span className="text-sm font-normal leading-6 text-[#121217]">
            {ui('financeAccountTransferAction')}
          </span>
        </DropdownMenuItem>

        {!isCash ? (
          <>
            {psd2Connected ? (
              <>
                <DropdownMenuItem
                  onClick={() => onPsd2Action?.('syncNow', account)}
                  data-testid={`account-row-menu-sync-${account.id}`}
                >
                  <RefreshCw className="h-5 w-5 text-[#828FA3]" data-testid="RefreshCw__ffaf9f" />
                  <span className="text-sm font-normal leading-6 text-[#121217]">
                    {ui('financeAccountsMenuSyncNow')}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator data-testid="DropdownMenuSeparator__ffaf9f" />
                <DropdownMenuItem
                  onClick={() => onPsd2Action?.('disconnect', account)}
                  data-testid={`account-row-menu-disconnect-${account.id}`}
                >
                  <Unlink2 className="h-5 w-5 text-[#828FA3]" data-testid="Unlink2__ffaf9f" />
                  <span className="text-sm font-normal leading-6 text-[#121217]">
                    {ui('financeAccountsMenuDisconnect')}
                  </span>
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem
                onClick={() => onPsd2Action?.('connect', account)}
                data-testid={`account-row-menu-connect-${account.id}`}
              >
                <Plug className="h-5 w-5 text-[#828FA3]" data-testid="Plug__ffaf9f" />
                <span className="text-sm font-normal leading-6 text-[#121217]">
                  {ui('financeAccountsMenuConnect')}
                </span>
              </DropdownMenuItem>
            )}
          </>
        ) : null}

        <DropdownMenuSeparator data-testid="DropdownMenuSeparator__ffaf9f" />
        <DropdownMenuItem
          onClick={() => onArchive?.(account)}
          data-testid={`account-row-menu-archive-${account.id}`}
        >
          <Archive className="h-5 w-5 text-[#D50B3E]" data-testid="Archive__ffaf9f" />
          <span className="text-sm font-normal leading-6 text-[#D50B3E]">
            {ui('financeAccountsMenuArchive')}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
