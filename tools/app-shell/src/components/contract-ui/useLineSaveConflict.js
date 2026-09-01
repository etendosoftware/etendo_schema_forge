/**
 * ETP-5073 / DOC-04 — concurrency-conflict handling for the LINES of a document.
 *
 * The header's equivalent lives in `useEntity` (`handleSaveErrorResponse` +
 * `discardChangesAndReload`). Lines needed their own copy because they are written through two
 * different paths, and both must report a conflict identically:
 *
 *   - the lines SIDEBAR save (`handleSaveLine`), for windows whose `linesLayout` renders a form;
 *   - the INLINE grid autosave (`buildInlineRowUpdateHandler`), for `linesLayout: 'inlineEditable'`
 *     windows such as sales-order.
 *
 * Extracted from DetailView.jsx rather than added to it: that file is size-gated, and this logic is
 * self-contained enough to test on its own.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { openSaveConflict, dismissSaveConflict } from '@/lib/saveConflict.js';
import { rememberRecordVersion } from '@etendosoftware/app-shell-core/lib/recordVersions.js';

/**
 * True when the server refused this write because the record moved on under the caller.
 *
 * Keyed off the `error` discriminator, never the 409 status alone: a duplicate key is also a 409
 * and its remedy is the opposite (change your data, not your baseline). Reads a CLONE so the
 * caller's own error-message extraction still has an unconsumed body.
 */
export async function isStaleRecordResponse(res) {
  try {
    const body = await res.clone().json();
    return body?.error === 'stale_record';
  } catch {
    return false;
  }
}

export function useLineSaveConflict({
  api, detailEntity, apiBaseUrl, apiFetch, token, hook, ui,
  selectedLine, setSelectedLine, setLineEdits, setLineEditColumns,
}) {
  /** The detail URL of one line, by id. */
  const buildLineUrl = useCallback((lineId) => (
    api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', lineId)
      || `${apiBaseUrl}/${detailEntity}/${lineId}`
  ), [api, detailEntity, apiBaseUrl]);

  /**
   * The lines sidebar's detail URL for the line currently open.
   *
   * Three places need the identical URL — the save, the post-save refresh and the conflict refresh
   * — and they must not drift: a mismatch would refresh a different record than the one just
   * written.
   */
  const buildSelectedLineUrl = useCallback(
    () => buildLineUrl(selectedLine?.id), [buildLineUrl, selectedLine?.id]);

  /**
   * Re-reads one line from the server and re-arms its optimistic-locking token.
   *
   * Throws on a failed read so each caller reports it in its own terms.
   */
  const reloadLineRow = useCallback(async (lineId) => {
    const res = await apiFetch(buildLineUrl(lineId), { token, baseUrl: '' });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const freshLine = json?.response?.data?.[0] ?? json;
    if (freshLine?.id) {
      // This read bypasses useEntity's normalizeRecord, so the optimistic-locking token is
      // recorded by hand. Without it the store would keep the version the conflict just
      // rejected and the very next save would fail again — a refresh that does not let the
      // user save is not a refresh.
      rememberRecordVersion(freshLine);
      hook.handleUpdateChild(lineId, freshLine);
    }
    return freshLine;
  }, [buildLineUrl, apiFetch, token, hook]);

  /**
   * Re-read the open line and drop its pending edits, after the user chose that over cancelling
   * in the conflict dialog.
   *
   * Deliberately not a merge, for the same reasons as the header's equivalent: it would overwrite
   * the other person's value on any field both had edited, and it would inject values without
   * running the callouts a real edit runs.
   */
  const discardLineChangesAndReload = useCallback(async () => {
    if (!selectedLine?.id) return;
    try {
      const freshLine = await reloadLineRow(selectedLine.id);
      if (freshLine?.id) setSelectedLine(prev => ({ ...prev, ...freshLine }));
      setLineEdits(null);
      setLineEditColumns({});
      dismissSaveConflict();
      toast.info(ui('saveConflictReloaded'));
    } catch {
      toast.error(ui('saveConflictReloadFailed'));
    }
  }, [selectedLine?.id, reloadLineRow, setSelectedLine, setLineEdits, setLineEditColumns, ui]);

  /**
   * The same refresh for a row edited inline, where there is no sidebar state to clear: the grid
   * re-renders from the reloaded row, and DataTable has already reverted the rejected cell.
   */
  const discardRowChangesAndReload = useCallback(async (lineId) => {
    try {
      await reloadLineRow(lineId);
      dismissSaveConflict();
      toast.info(ui('saveConflictReloaded'));
    } catch {
      toast.error(ui('saveConflictReloadFailed'));
    }
  }, [reloadLineRow, ui]);

  /**
   * Raise the shared conflict dialog for the sidebar save, and report whether it was raised.
   *
   * Returns false for every other failure so the caller falls through to its normal error toast,
   * and false when no dialog host is mounted — silence is the one outcome this ticket removes.
   */
  const raiseLineSaveConflict = useCallback(async (res) => (
    await isStaleRecordResponse(res) && openSaveConflict({ onRefresh: discardLineChangesAndReload })
  ), [discardLineChangesAndReload]);

  /**
   * The same dialog for an inline row edit, so a conflict looks identical wherever the user was
   * typing. Without it the inline grid only got a generic toast: it told the user their edit was
   * refused but left them to find the reload themselves, while the sidebar and the header both
   * offered the button.
   */
  const raiseRowSaveConflict = useCallback(async (res, lineId) => (
    Boolean(lineId) && await isStaleRecordResponse(res)
      && openSaveConflict({ onRefresh: () => discardRowChangesAndReload(lineId) })
  ), [discardRowChangesAndReload]);

  return {
    buildSelectedLineUrl,
    discardLineChangesAndReload,
    discardRowChangesAndReload,
    raiseLineSaveConflict,
    raiseRowSaveConflict,
  };
}
