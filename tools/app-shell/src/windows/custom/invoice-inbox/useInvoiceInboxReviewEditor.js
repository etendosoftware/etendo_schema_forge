import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { useRecordWriteQueue } from '@/hooks/useRecordWriteQueue.js';
import { applyOperations, markReviewed } from './invoiceInboxApi.js';
import { applyPendingToReview, isReloadCode, saveErrorKey } from './invoiceInboxReviewModel.js';
import { useInvoiceInboxReview } from './useInvoiceInboxReview.js';

/** "Guardado" fades back to nothing after this long. */
const SAVED_VISIBLE_MS = 2000;
const IDLE = Object.freeze({ status: 'idle', errorKey: null, errorText: null, code: null });
const NO_ENTRIES = Object.freeze([]);

/**
 * The editing API the review panel's inputs read (`useReviewEditor()`). `null` outside the panel
 * (a section rendered on its own is read only).
 */
export const ReviewEditorContext = createContext(null);

export function useReviewEditor() {
  return useContext(ReviewEditorContext);
}

/**
 * ETP-6050 S2 (plan 9.6 F3) — the editor of the review panel: autosave over the `apply` action.
 *
 * Design in five lines:
 * 1. ONE operation per write, through `useRecordWriteQueue` keyed by the document id: at most one
 *    write in flight, a write arriving mid-flight is queued under its field key (`header:documentNo`,
 *    `line:<index>:<field>`: last value wins) and replayed in order; structural and resolution
 *    operations have unique keys, so they never coalesce.
 * 2. Every write carries the token of the LAST answer (`tokenRef`, refreshed from each success);
 *    the answer replaces the server copy (`replace`).
 * 3. What the user did and the server has not answered yet is the PENDING overlay
 *    (`applyPendingToReview`): the effective review the panel renders is the server copy plus it,
 *    so inputs and totals are live. An acknowledged entry leaves the overlay in the same batch as
 *    the answer arrives.
 * 4. A refusal that says the document changed under us (`stale_document`, `processing`,
 *    `not_editable`, `not_reviewable`) reloads it, drops the local edits and shows a notice (S2-D4);
 *    any other refusal, or a network error, rolls the overlay back to the last answer and shows
 *    the reason; the queue discards what was behind a failed write.
 * 5. `flush()` asks every input to commit what it holds, then waits for the queue to drain; it
 *    resolves false when a write failed meanwhile (the caller stays open and shows the error).
 *
 * @param {Function} apiFetch from `useApiFetch(apiBaseUrl)`
 * @param {string|null} id the document open in the panel
 */
export function useInvoiceInboxReviewEditor(apiFetch, id) {
  const base = useInvoiceInboxReview(apiFetch, id);
  const { review: server, replace, refresh } = base;
  const [pendingState, setPendingState] = useState({ id: null, entries: NO_ENTRIES });
  const [save, setSave] = useState(IDLE);
  const [notice, setNotice] = useState(null);
  const [marking, setMarking] = useState(false);
  const pendingRef = useRef(new Map());
  const tokenRef = useRef(null);
  const idRef = useRef(id);
  const apiFetchRef = useRef(apiFetch);
  const failuresRef = useRef(0);
  const flushersRef = useRef(new Set());
  const savedTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const serverRef = useRef(server);
  idRef.current = id;
  apiFetchRef.current = apiFetch;
  serverRef.current = server;

  const syncPending = useCallback(() => {
    setPendingState({ id: idRef.current, entries: [...pendingRef.current.values()] });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Another document (or none): nothing pending, nothing saved, no notice. The token follows the answer.
  useEffect(() => {
    pendingRef.current.clear();
    setPendingState({ id, entries: NO_ENTRIES });
    setSave(IDLE);
    setNotice(null);
    clearTimeout(savedTimerRef.current);
  }, [id]);
  useEffect(() => {
    if (server?.updated != null) tokenRef.current = server.updated;
  }, [server]);

  const markSaved = useCallback(() => {
    if (!mountedRef.current) return;
    setSave({ ...IDLE, status: 'saved' });
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => {
      setSave((prev) => (prev.status === 'saved' ? IDLE : prev));
    }, SAVED_VISIBLE_MS);
  }, []);

  const rollback = useCallback((error) => {
    failuresRef.current += 1;
    pendingRef.current.clear();
    if (!mountedRef.current) return;
    syncPending();
    setSave({ status: 'error', errorKey: error.errorKey ?? null, errorText: error.errorText ?? null, code: error.code ?? null });
  }, [syncPending]);

  /** The document changed under us: reload it, drop the local edits, tell the user. */
  const reloadAfter = useCallback(async (code) => {
    failuresRef.current += 1;
    pendingRef.current.clear();
    const fresh = await refresh();
    if (fresh?.updated != null) tokenRef.current = fresh.updated;
    if (!mountedRef.current) return;
    syncPending();
    setSave(IDLE);
    setNotice({ key: saveErrorKey(code) });
  }, [refresh, syncPending]);

  const handleFailure = useCallback(async (outcome) => {
    if (isReloadCode(outcome.code)) {
      await reloadAfter(outcome.code);
    } else {
      rollback({ errorKey: saveErrorKey(outcome.code), code: outcome.code });
    }
    return false;
  }, [reloadAfter, rollback]);

  const handleNetworkError = useCallback((err) => {
    rollback(isNetworkError(err)
      ? { errorText: err.message, code: 'network' }
      : { errorKey: saveErrorKey(null), code: 'network' });
    return false;
  }, [rollback]);

  const write = useCallback(async ({ recordId, value: entry }) => {
    if (idRef.current !== recordId) return false;
    let outcome;
    try {
      outcome = await applyOperations(apiFetchRef.current, recordId, tokenRef.current, [entry.op]);
    } catch (err) {
      return idRef.current === recordId ? handleNetworkError(err) : false;
    }
    if (idRef.current !== recordId) return false;
    if (outcome.status !== 'ok') return handleFailure(outcome);
    tokenRef.current = outcome.review.updated ?? tokenRef.current;
    replace(outcome.review);
    if (pendingRef.current.get(entry.key) === entry) pendingRef.current.delete(entry.key);
    syncPending();
    if (pendingRef.current.size === 0) markSaved();
    return true;
  }, [handleFailure, handleNetworkError, markSaved, replace, syncPending]);

  const { persist, waitUntilIdle } = useRecordWriteQueue({ write });

  /**
   * Queues ONE operation. `key` decides coalescing (the same key while a write is open: last value
   * wins); `hint` carries display copies of what the operation picked, for the optimistic view.
   */
  const commit = useCallback((key, op, hint) => {
    const docId = idRef.current;
    if (!docId) return;
    const entry = { key, op, hint };
    pendingRef.current.set(key, entry);
    syncPending();
    setSave({ ...IDLE, status: 'saving' });
    persist(docId, key, entry).catch((err) => { handleNetworkError(err); });
  }, [handleNetworkError, persist, syncPending]);

  const registerFlush = useCallback((fn) => {
    flushersRef.current.add(fn);
    return () => { flushersRef.current.delete(fn); };
  }, []);

  /** Commits what the inputs hold and waits for the queue to drain; false when a write failed. */
  const flush = useCallback(async () => {
    const before = failuresRef.current;
    for (const fn of [...flushersRef.current]) fn();
    if (idRef.current) await waitUntilIdle(idRef.current);
    return failuresRef.current === before;
  }, [waitUntilIdle]);

  /**
   * 422 `not_valid`: the server moved the stored status to ERROR and answered the recomputed `missing`
   * and the NEW token. Adopt both locally (no reload) so the footer counter, the field errors and the
   * "Revisar" tag agree with the stored state.
   */
  const adoptNotValid = useCallback((outcome) => {
    const base = serverRef.current;
    if (outcome.updated != null) tokenRef.current = outcome.updated;
    if (!base) return;
    replace({
      ...base,
      status: outcome.documentStatus ?? 'ERROR',
      errorCode: base.errorCode ?? 'MISSING_FIELDS',
      updated: outcome.updated ?? base.updated,
      document: {
        ...base.document,
        validation: { ...(base.document?.validation ?? {}), valid: false, missing: outcome.missing ?? base.document?.validation?.missing ?? [] },
      },
    });
  }, [replace]);

  const markReviewedNow = useCallback(async () => {
    const docId = idRef.current;
    if (!docId) return false;
    if (!(await flush())) return false;
    setMarking(true);
    setSave({ ...IDLE, status: 'saving' });
    try {
      const outcome = await markReviewed(apiFetchRef.current, docId, tokenRef.current);
      if (idRef.current !== docId || !mountedRef.current) return false;
      if (outcome.status === 'ok') {
        tokenRef.current = outcome.review.updated ?? tokenRef.current;
        replace(outcome.review);
        markSaved();
        return true;
      }
      if (outcome.code === 'not_valid') adoptNotValid(outcome);
      return await handleFailure(outcome);
    } catch (err) {
      return idRef.current === docId ? handleNetworkError(err) : false;
    } finally {
      if (mountedRef.current) setMarking(false);
    }
  }, [adoptNotValid, flush, handleFailure, handleNetworkError, markSaved, replace]);

  const retry = useCallback(async () => {
    setSave(IDLE);
    const fresh = await refresh();
    if (fresh?.updated != null) tokenRef.current = fresh.updated;
  }, [refresh]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const entries = pendingState.id === id ? pendingState.entries : NO_ENTRIES;
  const review = useMemo(() => applyPendingToReview(server, entries), [server, entries]);
  const hasPending = entries.length > 0;
  const saving = save.status === 'saving' || hasPending || marking;

  // A reload or close while a write is open would lose it: ask the browser to confirm.
  useEffect(() => {
    if (!saving) return undefined;
    const guard = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [saving]);

  return {
    ...base,
    review,
    serverReview: server,
    save,
    saving,
    marking,
    notice,
    dismissNotice,
    commit,
    registerFlush,
    flush,
    markReviewed: markReviewedNow,
    retry,
  };
}
