import { useCallback } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { extractErrorMessage } from '@/hooks/useEntity';
import { useBatchDeleteDialog } from '@/hooks/useBatchDeleteDialog.jsx';

/**
 * Grid multi-select bulk delete — same styled confirm modal `useRowDelete`
 * uses, sized for N rows instead of one (ETP-4656).
 *
 * ETP-5758 — a thin wrapper over `useBatchDeleteDialog`, the app's single bulk-delete
 * implementation: this hook only supplies the per-row REST delete (`DELETE /{entity}/{id}`) and
 * the `bulk-delete` testid scope ListView / ListModalWindow (and their e2e specs) have always
 * used. The dialog, its in-progress lock (spinner, "Eliminando…", not dismissible until the batch
 * settles), the triage and the outcome toast all come from the generic hook.
 *
 * Returns:
 *   - requestBulkDelete(rows): opens the confirm dialog for the given rows —
 *     wire as the "Delete selected" toolbar action's onClick.
 *   - bulkDeleteDialog: JSX node the host must render once.
 *   - deleting: true while the batch is in flight (disable the trigger button).
 *
 * On confirm: issues one DELETE per row (in parallel), then reports back via
 * `onSuccess(succeededRows, failedRows)` so the host can update its own
 * selection state:
 *   - all succeeded  → host clears the selection.
 *   - partial failure → host keeps only the failed rows selected.
 *   - all failed      → host leaves the selection untouched.
 * The grid itself is expected to re-fetch (e.g. `hook.refresh()`) inside
 * `onSuccess` when at least one row succeeded — that naturally drops the
 * deleted rows and leaves the failed ones in place, no manual row surgery
 * needed here.
 */
export function useBulkRowDelete({ apiBaseUrl, entity = 'header', token, onSuccess }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);

  const deleteOneFn = useCallback((row) =>
    apiFetch(`/${entity}/${row.id}`, {
      method: 'DELETE',
    }).then(async (res) => {
      if (!res.ok) {
        const err = new Error(await extractErrorMessage(res, ui));
        // ETP-5111 — the status must travel with the error. The unified delete rule stopped
        // pre-disabling the "Delete selected" button for an ineligible selection (ListView's
        // `isRowDeletable` is gone), so the toast is now the ONLY place the refusal can be
        // explained; `batchDelete.isBusinessRejection` trusts a reason only when it carries a
        // 4xx status, so without this a single-row failure degraded to a bare counter and the
        // backend's own message was discarded. Same shape as `useCreateMovement.postAction`
        // and `useStatementActions`.
        err.status = res.status;
        throw err;
      }
      return row;
    }), [apiFetch, entity, ui]);

  const { requestBatchDelete, batchDeleteDialog, deleting } = useBatchDeleteDialog({
    deleteOneFn,
    onOutcome: onSuccess,
    testIdScope: 'bulk-delete',
  });

  const requestBulkDelete = useCallback((rows) => {
    // Without a base URL there is nothing to send the DELETEs to; the former implementation
    // opened the dialog and then silently ignored the confirm — do not open it at all.
    if (!apiBaseUrl) return;
    requestBatchDelete((rows || []).filter((r) => r?.id));
  }, [apiBaseUrl, requestBatchDelete]);

  return { requestBulkDelete, bulkDeleteDialog: batchDeleteDialog, deleting };
}
