import { useState } from 'react';
import { MoreVertical, BookOpen, CheckCircle2, RotateCcw, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useProcessMovement, useReactivateMovement, useDeleteMovement, usePostMovement } from '@/hooks/useCreateMovement';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import MovementConfirmModal from './MovementConfirmModal';

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
  const { processMovement, processing } = useProcessMovement();
  const { reactivateMovement, reactivating } = useReactivateMovement();
  const { deleteMovement, deleting } = useDeleteMovement();
  const { postMovement, posting } = usePostMovement();
  // Destructive-action confirmation ('reactivate' | 'delete' | null).
  const [confirm, setConfirm] = useState(null);

  const isPosted = movement.posted === 'Y';
  const isProcessed = Boolean(movement.processed);
  const isReconciled = movement.paymentStatus === 'RPPC';
  const isPaymentLinked = Boolean(movement.paymentId);
  const isGlTransaction = !isPaymentLinked;
  // Editable while not posted (contabilizado): Draft → full edit, Processed → partial edit
  // (the modal locks amount/type). Posted → must reactivate first, so no edit.
  const canEdit = isGlTransaction && !isPosted;
  const canProcess = isGlTransaction && !isProcessed;
  const canReactivate = isGlTransaction && isProcessed;
  const canDelete = isGlTransaction;
  // Contabilizar only makes sense once the movement is Processed (and not yet posted).
  const canPost = isProcessed && !isPosted;
  // The destructive-action confirmation only matters when there is something to undo — i.e. the
  // movement is posted (contabilizado) and/or reconciled. A merely-Processed movement reactivates
  // or deletes directly, without the dialog.
  const needsConfirm = isPosted || isReconciled;

  // Payment/collection-linked movements are managed from the Payments module (navigate to the
  // document from the row's Payment column). When there is nothing to offer here, don't render
  // an empty kebab.
  if (!canEdit && !canProcess && !canReactivate && !canDelete && !canPost) {
    return null;
  }
  const busy = posting || processing || reactivating || deleting;

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

  // Runs the action confirmed in the dialog, then closes it.
  async function runConfirmed() {
    if (confirm === 'delete') {
      await runLifecycle(deleteMovement, 'financeAccountTxRowDeleteSuccess', 'financeAccountTxRowDeleteError');
    } else {
      await runLifecycle(reactivateMovement, 'financeAccountTxRowReactivateSuccess', 'financeAccountTxRowReactivateError');
    }
    setConfirm(null);
  }

  return (
    <>
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

          {/* Post — contabilizar; only for Processed, not-yet-posted movements */}
          {canPost && (
            <DropdownMenuItem
              onClick={() => runLifecycle(postMovement, 'documentPosted', 'financeAccountMovementsRowPostError')}
              disabled={busy}
              data-testid="movement-row-post">
              <BookOpen className="h-5 w-5 text-[#828FA3]" data-testid="BookOpen__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {posting ? ui('financeAccountMovementsRowPosting') : ui('financeAccountMovementsRowPost')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Reactivate — Processed → Draft (G/L only); confirms first only when posted/reconciled */}
          {canReactivate && (
            <DropdownMenuItem
              onClick={() => (needsConfirm
                ? setConfirm('reactivate')
                : runLifecycle(reactivateMovement, 'financeAccountTxRowReactivateSuccess', 'financeAccountTxRowReactivateError'))}
              disabled={busy}
              data-testid="movement-row-reactivate">
              <RotateCcw className="h-5 w-5 text-[#828FA3]" data-testid="RotateCcw__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {reactivating ? ui('financeAccountTxRowReactivating') : ui('financeAccountTxRowReactivate')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Delete — Draft removed directly; Processed confirms first (Payment Removal) */}
          {canDelete && (
            <>
              <DropdownMenuSeparator data-testid="DropdownMenuSeparator__64eff3" />
              <DropdownMenuItem
                onClick={() => (needsConfirm
                  ? setConfirm('delete')
                  : runLifecycle(deleteMovement, 'financeAccountTxRowDeleteSuccess', 'financeAccountTxRowDeleteError'))}
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
      {confirm && (
        <MovementConfirmModal
          action={confirm}
          reconciled={isReconciled}
          posted={isPosted}
          onConfirm={runConfirmed}
          onClose={() => setConfirm(null)}
          data-testid="MovementConfirmModal__64eff3" />
      )}
    </>
  );
}
