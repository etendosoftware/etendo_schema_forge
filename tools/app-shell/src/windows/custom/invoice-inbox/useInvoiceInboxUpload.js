import { useCallback, useEffect, useRef, useState } from 'react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { uploadInboxFile } from './invoiceInboxApi.js';
import { appendUploadLog } from './invoiceInboxUploadLog.js';
import {
  fileResultLabelKey,
  QUEUE_STOPPING_CODES,
  uploadErrorLabelKey,
} from './invoiceInboxMessages.js';

/** Files sent at the same time. One request per file, so "Uploading X of N" counts delivered files. */
export const UPLOAD_CONCURRENCY = 2;

export const ITEM_QUEUED = 'queued';
export const ITEM_UPLOADING = 'uploading';
export const ITEM_ACCEPTED = 'accepted';
export const ITEM_REJECTED = 'rejected';
/** The request was sent but its answer was discarded: the file may or may not have been created. */
export const ITEM_UNCONFIRMED = 'unconfirmed';

const FAILED_KEY = 'invoiceInboxUploadFailed';
const UNCONFIRMED_KEY = 'invoiceInboxUploadUnconfirmed';

let nextItemKey = 0;

/** Whether a tray item is finished (delivered, refused, or sent without a usable answer). */
export function isItemDone(item) {
  return item.status === ITEM_ACCEPTED || item.status === ITEM_REJECTED || item.status === ITEM_UNCONFIRMED;
}

/**
 * The outcome of one upload as a tray item patch, plus the request code when it must stop the
 * rest of the queue.
 */
export function outcomePatch(outcome) {
  if (outcome.status === 'accepted') return { patch: { status: ITEM_ACCEPTED }, stopCode: null };
  if (outcome.status === 'rejected') {
    return { patch: { status: ITEM_REJECTED, reasonKey: fileResultLabelKey(outcome.code) }, stopCode: null };
  }
  const reasonKey = uploadErrorLabelKey(outcome.code);
  return {
    patch: { status: ITEM_REJECTED, reasonKey },
    stopCode: QUEUE_STOPPING_CODES.has(outcome.code) ? outcome.code : null,
  };
}

/**
 * A thrown upload as a tray item patch, plus whether it must stop the rest of the queue. A network
 * error stops it (no other file would get through) and carries its own, already translated, text.
 *
 * An `AbortError` is not a failure: `apiFetch` throws it when the session changed while the
 * request was in flight (a role or organization switch, a refresh that changed the access maps,
 * the auth provider remounting), and it does so AFTER the server answered, so the document may
 * well exist. It is reported as unconfirmed, never as refused. Any other unexpected error only
 * fails that file.
 */
export function errorOutcome(err) {
  if (isNetworkError(err)) return { patch: { status: ITEM_REJECTED, reasonText: err.message }, stops: true };
  if (err?.name === 'AbortError') return { patch: { status: ITEM_UNCONFIRMED, reasonKey: UNCONFIRMED_KEY }, stops: false };
  return { patch: { status: ITEM_REJECTED, reasonKey: FAILED_KEY }, stops: false };
}

/** The reason fields of a refused item: `{ reasonKey }` (i18n key) or `{ reasonText }` (translated). */
function reasonOf(patch) {
  return patch.reasonText ? { reasonText: patch.reasonText } : { reasonKey: patch.reasonKey };
}

/**
 * ETP-6049 — the upload queue of the Invoice Inbox: one request per file, two at a time.
 *
 * `onAccepted` runs after every delivered file (the page refreshes the list so the new
 * PROCESSING row shows up), and also after an unconfirmed one: the list is the only place that
 * can tell whether that document was created. `onStopped(reason)` runs once per batch when no other file can get
 * through: the server refuses the whole request (flag off, no access, organization not
 * writable) or the network is down. The files still queued are not sent and are marked refused
 * with that reason. `reason` is `{ reasonKey }` (an i18n key) or `{ reasonText }` (already
 * translated, the network error's message) — never translate `reasonText` again.
 * Leaving the page stops the queue: nothing more is sent after unmount. The queue is paused, not
 * emptied, so an effect re-run that keeps the state (React Fast Refresh in development, a new
 * `apiFetch`) resumes it instead of leaving its files queued forever.
 *
 * @param {Function} apiFetch from `useApiFetch(apiBaseUrl)`
 * Every delivered document is also recorded in the "Resultado de tus cargas" log
 * (`invoiceInboxUploadLog.js`) under `logKey`, captured when the files are queued. That write does
 * not depend on the page being mounted: a request still in flight when the user leaves records its
 * document anyway, so it shows in the result panel on the next visit.
 *
 * @param {{ onAccepted?: () => void,
 *   onStopped?: (reason: {reasonKey?: string, reasonText?: string}) => void,
 *   logKey?: string|null }} [handlers]
 */
export function useInvoiceInboxUpload(apiFetch, { onAccepted, onStopped, logKey = null } = {}) {
  const [items, setItems] = useState([]);
  const queueRef = useRef([]);
  const activeRef = useRef(0);
  const mountedRef = useRef(true);
  // One "stopped" notice per batch: both in-flight requests can hit the same refusal.
  const stoppedRef = useRef(false);
  const handlersRef = useRef({ onAccepted, onStopped, logKey });
  handlersRef.current = { onAccepted, onStopped, logKey };

  const patchItem = useCallback((key, patch) => {
    if (!mountedRef.current) return;
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const stopQueue = useCallback((reason) => {
    const stopped = new Set(queueRef.current.map((job) => job.key));
    queueRef.current = [];
    if (!mountedRef.current) return;
    if (stopped.size) {
      setItems((prev) => prev.map((item) => (stopped.has(item.key)
        ? { ...item, status: ITEM_REJECTED, ...reason }
        : item)));
    }
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    handlersRef.current.onStopped?.(reason);
  }, []);

  const runJob = useCallback(async (job) => {
    patchItem(job.key, { status: ITEM_UPLOADING });
    try {
      const result = await uploadInboxFile(apiFetch, job.file);
      // Outside React state and before any mounted check (see the hook's doc).
      if (result.status === 'accepted') appendUploadLog(job.logKey, result.id);
      const { patch, stopCode } = outcomePatch(result);
      patchItem(job.key, patch);
      if (patch.status === ITEM_ACCEPTED && mountedRef.current) handlersRef.current.onAccepted?.();
      if (stopCode) stopQueue(reasonOf(patch));
    } catch (err) {
      const { patch, stops } = errorOutcome(err);
      patchItem(job.key, patch);
      if (patch.status === ITEM_UNCONFIRMED && mountedRef.current) handlersRef.current.onAccepted?.();
      if (stops) stopQueue(reasonOf(patch));
    }
  }, [apiFetch, patchItem, stopQueue]);

  const pump = useCallback(() => {
    while (mountedRef.current && activeRef.current < UPLOAD_CONCURRENCY && queueRef.current.length) {
      const job = queueRef.current.shift();
      activeRef.current += 1;
      runJob(job).finally(() => {
        activeRef.current -= 1;
        pump();
      });
    }
  }, [runJob]);

  // Pause on cleanup, resume on setup: see the hook's doc for why the queue is not emptied.
  useEffect(() => {
    mountedRef.current = true;
    pump();
    return () => {
      mountedRef.current = false;
    };
  }, [pump]);

  /** Queues already-validated files. A new upload adds to the open tray (N grows). */
  const enqueue = useCallback((files) => {
    const jobs = Array.from(files).map((file) => {
      nextItemKey += 1;
      return { key: `upload-${nextItemKey}`, file, logKey: handlersRef.current.logKey };
    });
    if (!jobs.length) return;
    stoppedRef.current = false;
    setItems((prev) => [
      ...prev,
      ...jobs.map((job) => ({ key: job.key, name: job.file.name, status: ITEM_QUEUED })),
    ]);
    queueRef.current.push(...jobs);
    pump();
  }, [pump]);

  /** Closes the tray. Only offered once every item is done. */
  const clear = useCallback(() => setItems([]), []);

  const done = items.filter(isItemDone).length;
  return {
    items,
    done,
    total: items.length,
    finished: items.length > 0 && done === items.length,
    pending: items.length - done,
    enqueue,
    clear,
  };
}
