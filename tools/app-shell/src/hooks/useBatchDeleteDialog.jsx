import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
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
 *   - requestBatchDelete(items, options?): opens the confirm dialog for the
 *     given items (anything with enough identity for `deleteOneFn` to act on —
 *     filters out falsy entries). `options.deleteOneFn` / `options.onOutcome`
 *     override the hook-level ones for THIS request only, so one hook instance
 *     can serve several targets (ETP-5758: DetailView's primary lines and each
 *     secondary tab share one dialog).
 *   - batchDeleteDialog: JSX node the host must render once.
 *   - deleting: true while the batch is in flight.
 *
 * `testIdScope` is forwarded to `DeleteConfirmDialog` (default `batch-delete`).
 *
 * The dialog stays open and locked (spinner, "Eliminando…", Cancel disabled, not dismissible)
 * until the batch settles — ETP-5758. This hook is the app's single bulk-delete implementation:
 * `useBulkRowDelete` is a thin wrapper over it, and every multi-record delete (lists, document
 * lines, secondary tabs, custom grids) goes through it.
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
export function useBatchDeleteDialog({ deleteOneFn, onOutcome, renderDialog, testIdScope } = {}) {
  const ui = useUI();
  // `{ items, deleteOneFn?, onOutcome? }` — the per-request overrides travel with the items so
  // ONE hook instance can serve several targets (DetailView's primary lines + every secondary
  // tab), each with its own endpoint and its own outcome handling.
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // State-driven `disabled` only lands after a render commits; the ref closes the gap so two
  // clicks dispatched in the same tick can never start two batches.
  const inFlightRef = useRef(false);

  const requestBatchDelete = useCallback((items, options = {}) => {
    // A request made while a batch runs would replace `pending` and then be dropped silently by
    // that batch's own `setPending(null)` — refuse it instead (the dialog is modal and locked, so
    // only a programmatic caller can get here).
    if (inFlightRef.current) return;
    const list = (items || []).filter(Boolean);
    if (!list.length) return;
    setPending({ items: list, deleteOneFn: options.deleteOneFn, onOutcome: options.onOutcome });
  }, []);

  const close = useCallback(() => {
    if (deleting || inFlightRef.current) return;
    setPending(null);
  }, [deleting]);

  const confirm = useCallback(async () => {
    const items = pending?.items;
    if (!items?.length || inFlightRef.current) return;
    const runOne = pending.deleteOneFn ?? deleteOneFn;
    const report = pending.onOutcome ?? onOutcome;
    inFlightRef.current = true;
    setDeleting(true);
    try {
      // ETP-5758 — the dialog stays OPEN (and read-only, see DeleteConfirmDialog) while every
      // DELETE runs; it closes only once the whole batch has settled.
      const { succeeded, failed, errors } = await runBatchDelete(items, runOne);
      toastBatchDeleteOutcome(ui, { succeeded, failed, errors, total: items.length });
      setPending(null);
      report?.(succeeded, failed);
    } catch (err) {
      // `runBatchDelete` never rejects, so this is the host's `onOutcome` (or the toast) throwing
      // — e.g. a cache update on a hook that is gone. Without this the click handler ended in an
      // unhandled rejection with nothing on screen; the pre-ETP-5758 DetailView handlers caught it
      // with this same generic toast. The dialog still closes and the lock is released below.
      console.error('[useBatchDeleteDialog] batch delete outcome failed', err);
      setPending(null);
      toast.error(ui('networkError'));
    } finally {
      inFlightRef.current = false;
      setDeleting(false);
    }
  }, [pending, deleteOneFn, ui, onOutcome]);

  const pendingItems = pending?.items ?? null;
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
        testIdScope={testIdScope}
        data-testid="DeleteConfirmDialog__batch-delete" />
    );

  return { requestBatchDelete, batchDeleteDialog, deleting };
}
