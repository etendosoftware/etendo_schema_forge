import { toast } from 'sonner';

/**
 * ETP-4656 — shared, UI-agnostic core of the "checkbox selection → confirm →
 * batch delete → 3-outcome toast" pattern. Extracted once a 4th consumer
 * appeared (Financial Accounts main list, Movements tab, Statements tab —
 * ListView's `useBulkRowDelete` was the 1st) to stop copy-pasting the same
 * ~20 lines of Promise.allSettled triage + toast-outcome selection.
 *
 * Deliberately plain functions (no React, no dialog/selection state) so each
 * caller keeps full control of its own selection-state UI and `deleteOneFn`
 * (a REST DELETE for grid rows, `archiveAccount()` for financial accounts,
 * etc.) — see `useBatchDeleteDialog.jsx` for the React wrapper that adds the
 * confirm dialog + pending/deleting state on top of these.
 */

/**
 * Runs `deleteOneFn` for every item in parallel via `Promise.allSettled` and
 * partitions the original items back into `succeeded`/`failed` by index —
 * `Promise.allSettled` always preserves input order in its results array
 * regardless of which promise actually resolves first, so this is safe even
 * when requests settle out of order.
 *
 * @param {Array<T>} items
 * @param {(item: T) => Promise<any>} deleteOneFn - must throw/reject on failure.
 * @returns {Promise<{succeeded: Array<T>, failed: Array<T>}>}
 * @template T
 */
export async function runBatchDelete(items, deleteOneFn) {
  const results = await Promise.allSettled(items.map((item) => deleteOneFn(item)));
  const succeeded = [];
  const failed = [];
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') succeeded.push(items[idx]);
    else failed.push(items[idx]);
  });
  return { succeeded, failed };
}

/**
 * Fires exactly ONE toast for a batch-delete outcome, per the ETP-4656
 * Confluence design doc's 3-outcome table (not two stacked success+error
 * toasts — that was the older pattern every consumer, including
 * `DetailView.jsx`'s primary/secondary line-delete handlers, has since been
 * migrated to this shared helper):
 *   - all succeeded  -> success: "{count} deleted successfully."
 *   - partial        -> warning (single combined message): "X of Y deleted. Z could not be deleted."
 *   - all failed     -> error: "None of the X selected could be deleted."
 *
 * Reuses the exact same i18n keys everywhere this fires so every bulk-delete
 * surface in the app reads identically.
 *
 * @param {(key: string, params?: object) => string} ui
 * @param {{succeeded: Array<any>, failed: Array<any>, total: number}} outcome
 */
export function toastBatchDeleteOutcome(ui, { succeeded, failed, total }) {
  if (failed.length === 0) {
    toast.success(ui('bulkDeleteAllSucceeded', { count: succeeded.length }));
  } else if (succeeded.length === 0) {
    toast.error(ui('bulkDeleteAllFailed', { count: total }));
  } else {
    toast.warning(ui('bulkDeletePartialFailure', {
      succeeded: succeeded.length,
      total,
      failed: failed.length,
    }));
  }
}
