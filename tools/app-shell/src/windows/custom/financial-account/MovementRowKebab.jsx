import { useState } from 'react';
import { MoreVertical, BookOpen, BookX, CheckCircle2, RotateCcw, Trash2, Pencil } from 'lucide-react';
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
import MovementConfirmModal from './MovementConfirmModal';

// Post (contabilizar) / Unpost (descontabilizar) go through the financial-account spec's
// document-posting action (Java_Qualifier `document-posting` on the transaction entity).
const POST_URL = (id) =>
  `${getApiBase()}/sws/neo/financial-account/transaction/${encodeURIComponent(id)}/action/post`;
const UNPOST_URL = (id) =>
  `${getApiBase()}/sws/neo/financial-account/transaction/${encodeURIComponent(id)}/action/unpost`;

/**
 * Shared POST-with-token request used by both the post and unpost actions.
 * Returns { success, message } so callers decide how to surface the result.
 */
async function callTransactionAction(url, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json().catch(() => null);
  const nested = body?.response?.data?.[0];
  const message = nested?.message ?? body?.response?.message ?? body?.message;
  const success = res.ok && (nested?.success ?? body?.success ?? true);
  return { success, message };
}

/**
 * Per-row kebab menu for a movement row.
 * Only visible on row hover (parent row must have `group` class).
 *
 * Edit / Process / Reactivate / Delete apply ONLY to manual G/L-item transactions
 * (no `paymentId`); movements linked to an invoice payment/collection are managed
 * from the Payments module, so those actions are hidden for them. Post/Unpost
 * (contabilizar/descontabilizar) apply to any processed/posted movement.
 *
 * @param {{ movement: object, onReload?: () => void, onEdit?: (m: object) => void }} props
 */
export function MovementRowKebab({ movement, onReload, onEdit }) {
  const ui = useUI();
  const { token } = useAuth();
  const { processMovement, processing } = useProcessMovement();
  const { reactivateMovement, reactivating } = useReactivateMovement();
  const { deleteMovement, deleting } = useDeleteMovement();
  const [posting, setPosting] = useState(false);
  const [unposting, setUnposting] = useState(false);
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

  // Nothing to offer → don't render an empty kebab. Unpost applies to any posted movement, so it
  // keeps the kebab alive even for payment-linked posted rows.
  if (!canEdit && !canProcess && !canReactivate && !canDelete && !canPost && !isPosted) {
    return null;
  }
  const busy = posting || unposting || processing || reactivating || deleting;

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

  async function handlePost() {
    if (busy) return;
    setPosting(true);
    try {
      const { success, message } = await callTransactionAction(POST_URL(movement.id), token);
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

  async function handleUnpost() {
    if (busy || !isPosted) return;
    setUnposting(true);
    try {
      const { success, message } = await callTransactionAction(UNPOST_URL(movement.id), token);
      if (success) {
        toast.success(ui('documentUnposted'));
        onReload?.();
      } else {
        toast.error(message || ui('financeAccountMovementsRowUnpostError'));
      }
    } catch {
      toast.error(ui('financeAccountMovementsRowUnpostError'));
    } finally {
      setUnposting(false);
    }
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
          {/* Edit — reopen the movement modal for a Draft/Processed G/L transaction */}
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
              onClick={handlePost}
              disabled={busy}
              data-testid="movement-row-post">
              <BookOpen className="h-5 w-5 text-[#828FA3]" data-testid="BookOpen__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {posting ? ui('financeAccountMovementsRowPosting') : ui('financeAccountMovementsRowPost')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Unpost — descontabilizar; enabled while posted. No reconciliation-state field is
              exposed on the row, so it cannot be gated on reconciliation status here. */}
          {isPosted && (
            <DropdownMenuItem
              onClick={handleUnpost}
              disabled={busy}
              data-testid="movement-row-unpost">
              <BookX className="h-5 w-5 text-[#828FA3]" data-testid="BookX__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {unposting ? ui('financeAccountMovementsRowUnposting') : ui('financeAccountMovementsRowUnpost')}
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
