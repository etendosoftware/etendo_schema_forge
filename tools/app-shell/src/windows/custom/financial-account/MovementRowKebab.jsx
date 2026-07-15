import { useState } from 'react';
import { MoreVertical, GitMerge, BookOpen, CheckCircle2, RotateCcw, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from '@/hooks/useNeoResource';
import { useProcessMovement, useReactivateMovement, useDeleteMovement } from '@/hooks/useCreateMovement';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

const POST_URL = (id) =>
  `${getApiBase()}/sws/neo/financial-account-detail/transaction/${encodeURIComponent(id)}/action/post`;

/**
 * Per-row kebab menu for a movement row.
 * Only visible on row hover (parent row must have `group` class).
 *
 * Confirm / Reactivate / Delete apply ONLY to manual G/L-item transactions
 * (no `paymentId`); movements linked to an invoice payment/collection are
 * managed from the Payments module, so those actions are hidden for them.
 *
 * @param {{ movement: object, onReload?: () => void, onEdit?: (m: object) => void }} props
 */
export function MovementRowKebab({ movement, onReload, onEdit }) {
  const ui = useUI();
  const { token } = useAuth();
  const [posting, setPosting] = useState(false);
  const { processMovement, processing } = useProcessMovement();
  const { reactivateMovement, reactivating } = useReactivateMovement();
  const { deleteMovement, deleting } = useDeleteMovement();

  const isPosted = movement.posted === 'Y';
  const isProcessed = Boolean(movement.processed);
  const isGlTransaction = !movement.paymentId;
  const canEdit = isGlTransaction && !isProcessed;
  const canProcess = isGlTransaction && !isProcessed;
  const canReactivate = isGlTransaction && isProcessed;
  const canDelete = isGlTransaction;
  const busy = posting || processing || reactivating || deleting;

  async function handlePost() {
    if (posting || isPosted) return;
    setPosting(true);
    try {
      const res = await fetch(POST_URL(movement.id), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await res.json().catch(() => null);
      const nested = body?.response?.data?.[0];
      const message = nested?.message ?? body?.response?.message ?? body?.message;
      const success = res.ok && (nested?.success ?? body?.success ?? true);
      if (success) {
        toast.success(ui('documentPosted'));
        onReload?.();
      } else {
        toast.error(message || ui('financeAccountMovementsRowPostError'));
      }
    } catch {
      toast.error(ui('financeAccountMovementsRowPostError'));
    } finally {
      setPosting(false);
    }
  }

  async function runLifecycle(fn, successKey, errorKey) {
    if (busy) return;
    try {
      await fn({ id: movement.id });
      toast.success(ui(successKey));
      onReload?.();
    } catch (e) {
      toast.error(e?.message || ui(errorKey));
    }
  }

  return (
    <TooltipProvider data-testid="TooltipProvider__64eff3">
      <DropdownMenu data-testid="DropdownMenu__64eff3">
        <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__64eff3">
          <button
            type="button"
            aria-label={ui('financeAccountMovementsRowActions')}
            data-testid={`movement-row-menu-${movement.id}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#828FA3] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#E8EAEF]"
          >
            <MoreVertical className="h-5 w-5" data-testid="MoreVertical__64eff3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[220px]"
          data-testid="DropdownMenuContent__64eff3">
          {/* Edit — reopen the movement modal for a Draft G/L transaction */}
          {canEdit && (
            <DropdownMenuItem
              onClick={() => onEdit?.(movement)}
              disabled={busy}
              data-testid="movement-row-edit">
              <Pencil className="h-5 w-5 text-[#828FA3]" data-testid="Pencil__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {ui('financeAccountTxRowEdit')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Process — Draft → Processed (G/L transactions only) */}
          {canProcess && (
            <DropdownMenuItem
              onClick={() => runLifecycle(processMovement, 'financeAccountTxRowProcessSuccess', 'financeAccountTxRowProcessError')}
              disabled={busy}
              data-testid="movement-row-process">
              <CheckCircle2 className="h-5 w-5 text-[#828FA3]" data-testid="CheckCircle2__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {processing ? ui('financeAccountTxRowProcessing') : ui('financeAccountTxRowProcess')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Unreconcile — disabled with tooltip */}
          <Tooltip data-testid="Tooltip__64eff3">
            <TooltipTrigger asChild data-testid="TooltipTrigger__64eff3">
              <span>
                <DropdownMenuItem disabled data-testid="DropdownMenuItem__64eff3">
                  <GitMerge className="h-5 w-5 text-[#828FA3]" data-testid="GitMerge__64eff3" />
                  <span className="text-sm font-normal leading-6 text-[#121217]">
                    {ui('financeAccountMovementsRowUnreconcile')}
                  </span>
                </DropdownMenuItem>
              </span>
            </TooltipTrigger>
            <TooltipContent data-testid="TooltipContent__64eff3">{ui('financeAccountMovementsRowUnreconcileTooltip')}</TooltipContent>
          </Tooltip>

          {/* Post — enabled when not yet posted */}
          {!isPosted && (
            <DropdownMenuItem
              onClick={handlePost}
              disabled={busy}
              data-testid="DropdownMenuItem__64eff3">
              <BookOpen className="h-5 w-5 text-[#828FA3]" data-testid="BookOpen__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {posting ? ui('financeAccountMovementsRowPosting') : ui('financeAccountMovementsRowPost')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Reactivate — Processed → Draft (G/L transactions only) */}
          {canReactivate && (
            <DropdownMenuItem
              onClick={() => runLifecycle(reactivateMovement, 'financeAccountTxRowReactivateSuccess', 'financeAccountTxRowReactivateError')}
              disabled={busy}
              data-testid="movement-row-reactivate">
              <RotateCcw className="h-5 w-5 text-[#828FA3]" data-testid="RotateCcw__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {reactivating ? ui('financeAccountTxRowReactivating') : ui('financeAccountTxRowReactivate')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Delete — Draft directly, Processed via Payment Removal (G/L transactions only) */}
          {canDelete && (
            <>
              <DropdownMenuSeparator data-testid="DropdownMenuSeparator__64eff3" />
              <DropdownMenuItem
                onClick={() => runLifecycle(deleteMovement, 'financeAccountTxRowDeleteSuccess', 'financeAccountTxRowDeleteError')}
                disabled={busy}
                data-testid="movement-row-delete">
                <Trash2 className="h-5 w-5 text-[#D50B3E]" data-testid="Trash2__64eff3" />
                <span className="text-sm font-normal leading-6 text-[#D50B3E]">
                  {deleting ? ui('financeAccountTxRowDeleting') : ui('financeAccountTxRowDelete')}
                </span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
