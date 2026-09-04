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
import MovementLifecycleConfirmModal from './MovementLifecycleConfirmModal';
import { DeleteConfirmDialog } from '@/components/contract-ui/DeleteConfirmDialog.jsx';
import { resolveMovementDeleteBlock, resolveMovementReactivateBlock, movementHasUndoableState } from './movementActionEligibility.js';
import { translateBackendError } from '@/lib/backendErrors.js';

import { useApiFetch } from '@/auth/useApiFetch.js';
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
async function callTransactionAction(apiFetch, url, token) {
  const res = await apiFetch(url, { baseUrl: '', method: 'POST', body: '{}', token });
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
 * Edit / Process apply ONLY to manual G/L-item transactions (no `paymentId`); movements linked to
 * an invoice payment/collection are managed from the Payments module, so those actions are hidden
 * for them. Post/Unpost (contabilizar/descontabilizar) apply to any processed/posted movement.
 *
 * Delete and Reactivate are the exceptions, and deliberately so (ETP-5111, the unified rule): both
 * are offered on every row that could conceivably take them, and a movement the backend would
 * refuse is answered with the reason instead of a hidden item. They differ in ONE respect, on
 * purpose: Delete always confirms first (so it and the bulk-delete trash never give the same act
 * different protection), while a blocked Reactivate refuses with the toast alone — there is no bulk
 * reactivate to be consistent with, so a dialog would only add a click before the same sentence.
 *
 * WHICH confirmation Delete gets depends on what is actually at stake — see `showCartel` below.
 * `resolveMovementDeleteBlock` decides eligibility client-side, and for a blocked row (payment- or
 * receipt-linked, or a funds-transfer leg) the reason is shown after the user confirms, with no
 * request made. Because Delete is always present, this kebab always has at least one item.
 *
 * @param {{ movement: object, onReload?: () => void, onEdit?: (m: object) => void }} props
 */
export function MovementRowKebab({ movement, onReload, onEdit }) {
  const ui = useUI();
  const { token } = useAuth();
  const apiFetch = useApiFetch(getApiBase());
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
  // Reactivar is offered on every PROCESSED movement, payment-linked included (ETP-5111). A draft
  // is excluded because there is nothing to revert, not because of who owns the movement — the
  // `isGlTransaction` half of this condition used to HIDE the item for a payment-linked row, which
  // left the user with no explanation and left `handleReactivate` unguarded for REST/MCP callers.
  const canReactivate = isProcessed;
  // ETP-5111 — the reason this movement cannot be deleted / reactivated, or `null` when the action
  // may be attempted. Each item is rendered either way; a block turns the click into an explanatory
  // toast. Kept in `movementActionEligibility.js` so the rules are testable without React and stay
  // a single statement of the backend's own 409 guards.
  const deleteBlock = resolveMovementDeleteBlock(movement);
  const reactivateBlock = resolveMovementReactivateBlock(movement);
  // Contabilizar only makes sense once the movement is Processed (and not yet posted).
  const canPost = isProcessed && !isPosted;
  // "Is there anything to undo?" — the movement is posted (contabilizado) and/or reconciled.
  // Two different jobs read it: Reactivar uses it to decide whether to confirm AT ALL (a
  // merely-Processed movement reactivates on the spot), while Eliminar always confirms and uses it
  // only to pick WHICH dialog (see `showCartel` below). Imported rather than inlined because the
  // bulk-delete bar has to reach the same verdict for a one-row selection — it runs the same
  // Payment Removal — and two copies of this expression are exactly how the two surfaces drifted.
  const needsConfirm = movementHasUndoableState(movement);
  // ETP-5111 — WHICH confirmation the pending action gets. The lifecycle cartel exists to
  // enumerate what an action will undo, so it earns its place only when there is something to
  // enumerate; everywhere else the row kebab shows the very dialog the bulk trash shows, because
  // two different-looking confirmations for the same act on the same record was the original
  // complaint.
  //   - Reactivar        → always the cartel, because it only ever opens a dialog when there IS
  //                        something to undo: a blocked row is refused by the toast before
  //                        `confirm` is ever set, and a merely-Processed one reactivates on the
  //                        spot without confirming.
  //   - Eliminar, blocked → generic dialog. Nothing will happen at all, so the cartel would
  //                        promise to remove an asiento this delete never touches — including for
  //                        a blocked row that IS posted, which is the case that makes this matter.
  //   - Eliminar, draft  → generic dialog. Nothing to undo.
  //   - Eliminar, posted and/or reconciled → the cartel, unchanged. The most destructive thing
  //                        this menu can do, and the one place the warning is worth two dialogs.
  const showCartel = confirm === 'reactivate' || (confirm === 'delete' && !deleteBlock && needsConfirm);
  // Is there anything ABOVE the Delete item? Delete is the only unconditional item (ETP-5111), so
  // its separator has to be gated on this or it renders as a stray leading divider — precisely on
  // the payment-linked draft this change exists to serve, where every other flag is false.
  const hasActionsAboveDelete = canEdit || canProcess || canPost || isPosted || canReactivate;

  // No "nothing to offer" early return any more (ETP-5111): Delete is now rendered on every row,
  // so the menu is never empty. It used to be hidden entirely for, say, a payment-linked draft —
  // exactly the row whose delete refusal we now have to explain.
  const busy = posting || unposting || processing || reactivating || deleting;

  async function runLifecycle(fn, successKey, errorKey) {
    if (busy) return;
    try {
      await fn({ id: movement.id });
      toast.success(ui(successKey));
      onReload?.();
    } catch (e) {
      // The hooks now throw the backend's own business message (useCreateMovement.postAction), so
      // it goes through the shared translator before being shown — otherwise the user reads it in
      // English. Falls back to the generic per-action key when there was no message at all.
      toast.error(translateBackendError(e?.message, ui) || ui(errorKey));
    }
  }

  // ETP-5111 — ALWAYS confirm, blocked or not. Every other arrangement gave the same record two
  // different levels of protection depending on which control the user reached for: first the
  // kebab deleted a draft on a single click while the bulk trash confirmed every selection, then
  // the kebab skipped the dialog for a blocked row while the bulk trash still showed it. The
  // eligibility check therefore lives in `runConfirmed`, not here — the user confirms, and only
  // then learns the delete cannot proceed.
  function handleDeleteClick() {
    setConfirm('delete');
  }

  // Reactivar, unlike Eliminar, refuses with NO dialog (ETP-5111). The asymmetry is deliberate and
  // it is not the one the user rejected for delete: that one existed because the bulk trash and the
  // kebab confirmed the SAME act differently. There is no bulk reactivate — the selection bar only
  // deletes — so there is no second path to be consistent with, and making the user confirm an
  // action that provably cannot happen would only add a click before the same sentence.
  function handleReactivateClick() {
    if (reactivateBlock) {
      toast.error(ui(reactivateBlock.key));
      return;
    }
    if (needsConfirm) setConfirm('reactivate');
    else runLifecycle(reactivateMovement, 'financeAccountTxRowReactivateSuccess', 'financeAccountTxRowReactivateError');
  }

  // Runs the action confirmed in the dialog, then closes it.
  async function runConfirmed() {
    if (confirm === 'delete') {
      if (deleteBlock) {
        // Confirmed, but this row can never be deleted from here (payment- or receipt-linked, or a
        // funds-transfer leg). Explain it and stop: `deleteMovement` is deliberately NOT called,
        // so there is no request and no 409 round-trip. The backend's matching guard stays as the
        // safety net for every other caller.
        toast.error(ui(deleteBlock.key));
      } else {
        await runLifecycle(deleteMovement, 'financeAccountTxRowDeleteSuccess', 'financeAccountTxRowDeleteError');
      }
    } else {
      await runLifecycle(reactivateMovement, 'financeAccountTxRowReactivateSuccess', 'financeAccountTxRowReactivateError');
    }
    setConfirm(null);
  }

  async function handlePost() {
    if (busy) return;
    setPosting(true);
    try {
      const { success, message } = await callTransactionAction(apiFetch, POST_URL(movement.id), token);
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
      const { success, message } = await callTransactionAction(apiFetch, UNPOST_URL(movement.id), token);
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[hsl(var(--border-subtle))]"
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
              <Pencil className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="Pencil__64eff3" />
              <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
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
              <CheckCircle2 className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="CheckCircle2__64eff3" />
              <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
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
              <BookOpen className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="BookOpen__64eff3" />
              <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
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
              <BookX className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="BookX__64eff3" />
              <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
                {unposting ? ui('financeAccountMovementsRowUnposting') : ui('financeAccountMovementsRowUnpost')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Reactivate — Processed → Draft, offered on EVERY processed row (ETP-5111). A
              payment-linked one is refused with an explanatory toast; otherwise it confirms first
              only when there is a conciliación and/or an asiento to undo. */}
          {canReactivate && (
            <DropdownMenuItem
              onClick={handleReactivateClick}
              disabled={busy}
              data-testid="movement-row-reactivate">
              <RotateCcw className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="RotateCcw__64eff3" />
              <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
                {reactivating ? ui('financeAccountTxRowReactivating') : ui('financeAccountTxRowReactivate')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Delete — always offered, and always confirms first, whatever the row's state
              (ETP-5111). A blocked row gets its explanation after confirming. */}
          {hasActionsAboveDelete && (
            <DropdownMenuSeparator data-testid="DropdownMenuSeparator__64eff3" />
          )}
          <DropdownMenuItem
            onClick={handleDeleteClick}
            disabled={busy}
            data-testid="movement-row-delete">
            <Trash2 className="h-5 w-5 text-[hsl(var(--destructive))]" data-testid="Trash2__64eff3" />
            <span className="text-sm font-normal leading-6 text-[hsl(var(--destructive))]">
              {deleting ? ui('financeAccountTxRowDeleting') : ui('financeAccountTxRowDelete')}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirm && (showCartel ? (
        <MovementLifecycleConfirmModal
          action={confirm}
          reconciled={isReconciled}
          posted={isPosted}
          onConfirm={runConfirmed}
          onClose={() => setConfirm(null)}
          data-testid="MovementLifecycleConfirmModal__64eff3" />
      ) : (
        // The same component the bulk trash renders — see `DeleteConfirmDialog`. `count={1}`
        // because this row action is exactly one record.
        <DeleteConfirmDialog
          open
          count={1}
          deleting={deleting}
          onConfirm={runConfirmed}
          onClose={() => setConfirm(null)}
          data-testid="DeleteConfirmDialog__64eff3" />
      ))}
    </>
  );
}
