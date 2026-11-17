import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthOptional } from '@etendosoftware/app-shell-core/auth';
import { fetchRowsByIdChunked } from './invoiceInboxApi.js';
import {
  readUploadLog, removeFromUploadLog, subscribeUploadLog, uploadLogKey,
} from './invoiceInboxUploadLog.js';
import { rowsByRequestedId, summarizeUploadResult } from './invoiceInboxUploadResult.js';

/**
 * The upload-log key of the signed-in company and account, or null when either is unknown (then
 * nothing is recorded and the result panel does not show).
 */
export function useUploadLogKey() {
  const auth = useAuthOptional();
  return uploadLogKey(auth?.clientId, auth?.account?.id);
}

function recordedIds(logKey) {
  return readUploadLog(logKey).map((entry) => entry.id);
}

/** The recorded ids of a key, kept in sync with writes from this tab and from other tabs. */
function useRecordedIds(logKey) {
  const [ids, setIds] = useState(() => recordedIds(logKey));
  useEffect(() => {
    const sync = () => {
      const next = recordedIds(logKey);
      setIds((prev) => (prev.join(',') === next.join(',') ? prev : next));
    };
    sync();
    return subscribeUploadLog((key) => {
      if (key == null || key === logKey) sync();
    });
  }, [logKey]);
  return ids;
}

/**
 * ETP-6049 — "Resultado de tus cargas": the server-side state of the documents this browser
 * uploaded (`invoiceInboxUploadLog.js`).
 *
 * Reads the recorded ids it does not know yet with `id inSet` in chunks of 50. It does NOT poll:
 * the page's single PROCESSING poll also re-reads `summary.pendingIds` and hands the answer to
 * `mergeRows`, as the list does with `replaceRows`. `dismiss` ("Entendido") drops the finished
 * documents from the record; documents still being read stay.
 *
 * @param {Function} apiFetch from `useApiFetch(apiBaseUrl)`
 * @param {string|null} logKey from `useUploadLogKey()`
 */
export function useInvoiceInboxUploadResult(apiFetch, logKey) {
  const ids = useRecordedIds(logKey);
  const [rowsById, setRowsById] = useState(() => new Map());
  const [loadError, setLoadError] = useState(false);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const abortRef = useRef(null);

  /** Stores the answer for the requested ids that are recorded; a missing one becomes "gone". */
  const mergeRows = useCallback((requested, fresh) => {
    const recorded = new Set(idsRef.current);
    const mine = requested.filter((id) => recorded.has(id));
    if (!mine.length) return;
    setRowsById((prev) => new Map([...prev, ...rowsByRequestedId(mine, fresh)]));
  }, []);

  const load = useCallback(async (wanted) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const fresh = await fetchRowsByIdChunked(apiFetch, wanted, ctrl.signal);
      if (abortRef.current !== ctrl) return;
      setLoadError(false);
      mergeRows(wanted, fresh);
    } catch (err) {
      if (err?.name !== 'AbortError' && abortRef.current === ctrl) setLoadError(true);
    }
  }, [apiFetch, mergeRows]);

  // Recorded ids not read yet (first visit, a new upload, another tab): read them once.
  const idsKey = ids.join(',');
  useEffect(() => {
    const unknown = ids.filter((id) => !rowsById.has(id));
    if (unknown.length) load(unknown);
  // `rowsById` is left out on purpose: reading it here must not re-trigger a read per answer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const summary = useMemo(() => summarizeUploadResult(ids, rowsById), [ids, rowsById]);
  const knownRows = useMemo(() => ids.some((id) => rowsById.has(id)), [ids, rowsById]);

  const retry = useCallback(() => load(idsRef.current), [load]);

  const dismiss = useCallback(() => {
    const waiting = new Set(summary.pendingIds);
    removeFromUploadLog(logKey, idsRef.current.filter((id) => !waiting.has(id)));
  }, [logKey, summary.pendingIds]);

  return {
    ids,
    summary,
    loadError: loadError && !knownRows,
    mergeRows,
    retry,
    dismiss,
  };
}
