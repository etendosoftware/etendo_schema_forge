import { useCallback, useState } from 'react';
import { DeleteConfirmDialog } from '@/components/contract-ui/DeleteConfirmDialog.jsx';
import { useUI } from '@/i18n';
import { runBatchDelete, toastBatchDeleteOutcome } from '@/lib/batchDelete.js';

/**
 * Generic "checkbox selection → confirm-with-count → batch delete → 3-outcome
 * toast" dialog, independent of how the caller actually deletes one item
 * (REST DELETE against a NEO entity, an `archiveAccount()`-style mutation
 * hook, etc. — supplied as `deleteOneFn`). ETP-4656: extracted so
 * `useBulkRowDelete` (grid rows) and the Financial Accounts / Movements /
 * Statements bulk-delete additions all share the same dialog + outcome
 * wiring instead of re-implementing it.
 *
 * Returns:
 *   - requestBatchDelete(items): opens the confirm dialog for the given items
 *     (anything with enough identity for `deleteOneFn` to act on — filters
 *     out falsy entries).
 *   - batchDeleteDialog: JSX node the host must render once.
 *   - deleting: true while the batch is in flight.
 *
 * On confirm: runs `deleteOneFn` for every item (via `runBatchDelete`), fires
 * the single outcome toast (via `toastBatchDeleteOutcome` — which names the
 * reason when every failure shares one, so `deleteOneFn` should reject with the
 * backend's own message rather than a bare status code), then calls
 * `onOutcome(succeededItems, failedItems)` so the host can update its own
 * selection state:
 *   - all succeeded  → host clears the selection.
 *   - partial failure → host keeps only the failed items selected.
 *   - all failed      → host leaves the selection untouched.
 * The host is expected to re-fetch its list (when at least one item
 * succeeded) inside `onOutcome` — that naturally drops the deleted items and
 * leaves the failed ones in place, no manual list surgery needed here.
 *
 * ETP-5111 — the DIALOG now lives in `DeleteConfirmDialog`, so a single-row surface can show the
 * identical confirmation without adopting this hook's semantics. Reaching for that component
 * directly is the right move for a per-row action, and this hook is deliberately NOT the reuse
 * vehicle: it owns the outcome toast (`toastBatchDeleteOutcome`'s counter wording, which reads
 * oddly for one row), it always renders its dialog node (one hidden Radix dialog per row on a long
 * grid), and it gives the caller no way to decline the delete after the user has confirmed — which
 * the Movimientos kebab needs for a row its client-side pre-check has already ruled out.
 */
export function useBatchDeleteDialog({ deleteOneFn, onOutcome, renderDialog }) {
  const ui = useUI();
  const [pendingItems, setPendingItems] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const requestBatchDelete = useCallback((items) => {
    const list = (items || []).filter(Boolean);
    if (!list.length) return;
    setPendingItems(list);
  }, []);

  const close = useCallback(() => {
    if (deleting) return;
    setPendingItems(null);
  }, [deleting]);

  const confirm = useCallback(async () => {
    if (!pendingItems?.length) return;
    setDeleting(true);
    try {
      const { succeeded, failed, errors } = await runBatchDelete(pendingItems, deleteOneFn);
      toastBatchDeleteOutcome(ui, { succeeded, failed, errors, total: pendingItems.length });
      setPendingItems(null);
      onOutcome?.(succeeded, failed);
    } finally {
      setDeleting(false);
    }
  }, [pendingItems, deleteOneFn, ui, onOutcome]);

  const count = pendingItems?.length ?? 0;

  // ETP-5111 — the markup moved to `DeleteConfirmDialog` so the Movimientos row kebab can render
  // the very same dialog for a single row instead of a lookalike. Byte-identical output: same
  // component, same keys, same data-testids.
  //
  // `renderDialog` lets a host substitute a domain-specific confirmation while keeping every batch
  // semantic above (the outcome toast, `onOutcome`, the in-flight lock). Movimientos needs it
  // because a ONE-row selection is deleted through Payment Removal — it desconcilia and
  // descontabiliza — so that case has to carry the same warning the row kebab shows, while a
  // multi-row selection keeps the neutral count dialog. It receives the pending items so the host
  // can inspect the actual records, not just how many there are.
  const dialogProps = {
    open: Boolean(pendingItems),
    count,
    items: pendingItems || [],
    deleting,
    onConfirm: confirm,
    onClose: close,
  };
  const batchDeleteDialog = renderDialog
    ? renderDialog(dialogProps)
    : (
      <DeleteConfirmDialog
        open={dialogProps.open}
        count={count}
        deleting={deleting}
        onConfirm={confirm}
        onClose={close}
        data-testid="DeleteConfirmDialog__batch-delete" />
    );

  return { requestBatchDelete, batchDeleteDialog, deleting };
}
