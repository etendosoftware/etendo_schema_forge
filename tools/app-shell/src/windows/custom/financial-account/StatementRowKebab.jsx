import { MoreVertical, PlayCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { isDraftStatement } from './statementStatus.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

/**
 * Per-row kebab menu for an imported-statement row. Holds the state-transition
 * actions: "Procesar" (enabled only for drafts) and "Reactivar" (enabled only
 * for processed statements). The non-applicable one renders disabled with an
 * explanatory tooltip.
 *
 * Edit is NOT here — it lives as an inline hover quick-action on the row (see
 * {@link StatementsTable}), mirroring the sales-order grid. Delete used to be there too, but as of
 * ETP-5111 it is a kebab item instead: the inline action hides itself for a processed statement, so
 * on that row the affordance was simply absent and the refusal had nowhere to be explained.
 *
 * `bankConnected` (ETP-4921) closes the whole edit path on a PSD2-connected account: its
 * statements come from the bank and must not be hand-edited. Reactivar is the only door —
 * Edit already hides itself for a processed statement and Delete is refused for one, and
 * reactivating is what would reopen both — so disabling it here is what makes the account
 * read-only. It is an
 * ACCOUNT-level flag on purpose: nothing on the statement itself records that it came from the
 * bank (the PSD2 module only sets `fileName` from a translated AD_MESSAGE, so its value depends
 * on the language the sync ran in). Keying off the connection is coherent with what this window
 * already does — `StatementsToolbar` replaces "Importar / Nuevo extracto" with "Sincronizar
 * extractos" on such an account, so a statement cannot be created by hand there either.
 *
 * Procesar is deliberately NOT gated by it: completing a draft is not editing its content.
 *
 * @param {{
 *   statement: object,
 *   onProcess: (s: object) => void,
 *   onReactivate: (s: object) => void,
 *   onDelete: (s: object) => void,
 *   bankConnected?: boolean,
 * }} props
 */
export function StatementRowKebab({ statement: s, onProcess, onReactivate, onDelete, bankConnected = false }) {
  const ui = useUI();
  const isDraft = isDraftStatement(s);
  const lockedTip = ui('financeAccountStatementsRowProcessedTooltip');
  // Its own wording rather than the "already processed" one: the user must not be left thinking
  // this unblocks by processing or reactivating something. Nothing they can do in this window
  // unblocks it — the account is connected to the bank.
  const reactivateTip = bankConnected
    ? ui('financeAccountStatementsRowBankSyncedTooltip')
    : ui('financeAccountStatementsRowReactivateTooltip');

  // A menu item active only when `enabled`, otherwise disabled with a tooltip.
  const gatedItem = ({ icon: Icon, label, onClick, testid, enabled, tip }) => {
    const item = (
      <DropdownMenuItem
        disabled={!enabled}
        data-testid={testid}
        onClick={enabled ? () => onClick(s) : undefined}
      >
        <Icon className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="Icon__b97a5b" />
        <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">{label}</span>
      </DropdownMenuItem>
    );
    if (enabled) return item;
    return (
      <Tooltip data-testid="Tooltip__b97a5b">
        <TooltipTrigger asChild data-testid="TooltipTrigger__b97a5b"><span>{item}</span></TooltipTrigger>
        <TooltipContent data-testid="TooltipContent__b97a5b">{tip}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider data-testid="TooltipProvider__b97a5b">
      <DropdownMenu data-testid="DropdownMenu__b97a5b">
        <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__b97a5b">
          <button
            type="button"
            aria-label={ui('financeAccountStatementsRowActions')}
            data-testid={`statement-row-menu-${s.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[hsl(var(--border-subtle))]"
          >
            <MoreVertical className="h-5 w-5" data-testid="MoreVertical__b97a5b" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[220px]"
          onClick={(e) => e.stopPropagation()}
          data-testid="DropdownMenuContent__b97a5b">
          {gatedItem({
            icon: PlayCircle,
            label: ui('financeAccountStatementsRowProcess'),
            onClick: onProcess,
            testid: 'statement-row-process',
            enabled: isDraft,
            tip: lockedTip,
          })}
          {gatedItem({
            icon: RotateCcw,
            label: ui('financeAccountStatementsRowReactivate'),
            onClick: onReactivate,
            testid: 'statement-row-reactivate',
            enabled: !isDraft && !bankConnected,
            tip: reactivateTip,
          })}
          {/* ETP-5111 — Eliminar joins this menu, and unlike its neighbours it is NEVER gated.
              It used to exist only as an inline hover quick-action in `StatementsTable`, which
              hides itself for a processed statement, so on a processed row the action was simply
              absent and the user had no way to learn why. Offered on every row: the confirm
              dialog opens, and the backend's 400 (translated in `runConfirm`) explains that the
              statement has to be reactivated first. Same rule the movements kebab and the three
              bulk-delete trash buttons follow. */}
          <DropdownMenuItem
            data-testid="statement-row-delete"
            onClick={() => onDelete?.(s)}
          >
            <Trash2 className="h-5 w-5 text-[hsl(var(--destructive))]" data-testid="Trash2__b97a5b" />
            <span className="text-sm font-normal leading-6 text-[hsl(var(--destructive))]">
              {ui('financeAccountStatementsRowDelete')}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
