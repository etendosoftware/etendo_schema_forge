import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { useRecordWriteQueue } from '@/hooks/useRecordWriteQueue.js';
import { applyOperations, confirmInboxDocument, markReviewed } from './invoiceInboxApi.js';
import { applyPendingToReview, canConfirm, canMarkReviewed, isReloadCode, saveErrorKey } from './invoiceInboxReviewModel.js';
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
  // A confirm refusal the user must read in full and retrying cannot fix (duplicate, tax-included price
  // list, exchange rate, address, quota…): a banner at the top of the form, never the header's save slot.
  const [refusal, setRefusal] = useState(null);
  const [marking, setMarking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Set synchronously (a state update is not): a fast double click must send ONE confirm.
  const confirmingRef = useRef(false);
  // Same for mark-reviewed; the two are mutually exclusive (one request on the document at a time).
  const markingRef = useRef(false);
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
  // The freshest answer of a write (the render that adopts it may not have happened yet when a click
  // handler resumes after `flush()`), and whether a save failed since the user's last edit.
  const lastAnswerRef = useRef(null);
  const writeFailedRef = useRef(false);

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
    setRefusal(null);
    lastAnswerRef.current = null;
    writeFailedRef.current = false;
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
    writeFailedRef.current = true;
    pendingRef.current.clear();
    if (!mountedRef.current) return;
    syncPending();
    setSave({ status: 'error', errorKey: error.errorKey ?? null, errorText: error.errorText ?? null, code: error.code ?? null });
  }, [syncPending]);

  /** The document changed under us: reload it, drop the local edits, tell the user. */
  const reloadAfter = useCallback(async (code) => {
    failuresRef.current += 1;
    writeFailedRef.current = true;
    lastAnswerRef.current = null;
    pendingRef.current.clear();
    const fresh = await refresh();
    if (fresh?.updated != null) tokenRef.current = fresh.updated;
    // The failure was handled by the reload: the fresh document and its token are the new baseline, so the
    // next confirm / mark-reviewed click must go through. A failed re-read keeps the block (stale token).
    if (fresh) writeFailedRef.current = false;
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
    lastAnswerRef.current = outcome.review;
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
    setRefusal(null);
    writeFailedRef.current = false;
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
    lastAnswerRef.current = null;
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

  /** Adopts a confirmed-OK review answer: its token, the "last answer" the gates read, and the view. */
  const adoptAnswer = useCallback((review) => {
    tokenRef.current = review.updated ?? tokenRef.current;
    lastAnswerRef.current = review;
    replace(review);
  }, [replace]);

  /**
   * Shared preamble of the two footer actions. The click may have blurred an input: wait for its save and
   * use the token it returned. A failed save, one that left required fields pending, or a document the
   * gate (`canMarkReviewed` / `canConfirm`) no longer accepts sends nothing (the panel shows why).
   */
  const readyToSend = useCallback(async (gate) => {
    if (!(await flush()) || writeFailedRef.current) return false;
    return gate(lastAnswerRef.current ?? serverRef.current);
  }, [flush]);

  /**
   * A refused request that reloads / adopts the server state. The refused request is not a failed save:
   * the next click may retry (a reload code already cleared the flag when the re-read worked).
   */
  const reloadAfterRefusal = useCallback(async (outcome) => {
    if (outcome.code === 'not_valid') adoptNotValid(outcome);
    const handled = await handleFailure(outcome);
    if (!isReloadCode(outcome.code)) writeFailedRef.current = false;
    return handled;
  }, [adoptNotValid, handleFailure]);

  /** A request that threw (no HTTP answer): a network failure unless the open document changed. */
  const failOnThrow = useCallback((err, docId) => {
    if (idRef.current !== docId) return false;
    const handled = handleNetworkError(err);
    writeFailedRef.current = false;
    return handled;
  }, [handleNetworkError]);

  const markReviewedNow = useCallback(async () => {
    const docId = idRef.current;
    // Synchronous guard (a state update is not): a fast double click sends ONE request, and a click while
    // a confirm runs is ignored.
    if (!docId || markingRef.current || confirmingRef.current) return false;
    markingRef.current = true;
    // `marking` is on from the first instant: both footer buttons are disabled while the save settles.
    setMarking(true);
    try {
      if (!(await readyToSend(canMarkReviewed))) return false;
      setSave({ ...IDLE, status: 'saving' });
      const outcome = await markReviewed(apiFetchRef.current, docId, tokenRef.current);
      if (idRef.current !== docId || !mountedRef.current) return false;
      if (outcome.status === 'ok') {
        adoptAnswer(outcome.review);
        markSaved();
        return true;
      }
      return await reloadAfterRefusal(outcome);
    } catch (err) {
      return failOnThrow(err, docId);
    } finally {
      markingRef.current = false;
      if (mountedRef.current) setMarking(false);
    }
  }, [adoptAnswer, failOnThrow, markSaved, readyToSend, reloadAfterRefusal]);

  /** Re-reads the document and adopts its token (what the server stored after a refused confirm). */
  const retryRefresh = useCallback(async () => {
    // The server copy is refreshed (ERROR / CONFIRM_FAILED): an older answer must not win the next gate.
    lastAnswerRef.current = null;
    const fresh = await refresh();
    if (fresh?.updated != null) tokenRef.current = fresh.updated;
  }, [refresh]);

  /**
   * A confirm refused or failed (not confirmed): a reload code or `not_valid` reloads the document like a
   * failed save; `confirm_failed` re-reads it (the row moved to ERROR / CONFIRM_FAILED, its banner with the
   * stored reason says it all); the rest changed nothing on the server: no reload, no retry, a full-width
   * banner with the cause.
   */
  const handleConfirmRefusal = useCallback(async (outcome) => {
    if (outcome.code === 'not_valid' || isReloadCode(outcome.code)) {
      await reloadAfterRefusal(outcome);
      return;
    }
    if (outcome.code === 'confirm_failed') {
      await retryRefresh();
      setSave(IDLE);
      return;
    }
    setSave(IDLE);
    setRefusal({ code: outcome.code, key: saveErrorKey(outcome.code) });
  }, [reloadAfterRefusal, retryRefresh]);

  /**
   * ETP-6051 — confirms the open document: waits for the saves, then `confirm` with the last token.
   * Resolves the confirm answer (`{id, status: 'CONFIRMED', invoice, createdProducts, …}`) or null.
   */
  const confirmNow = useCallback(async () => {
    const docId = idRef.current;
    if (!docId || confirmingRef.current || markingRef.current) return null;
    confirmingRef.current = true;
    setRefusal(null);
    // `confirming` is on from the first instant: navigation and closing wait for the answer.
    setConfirming(true);
    try {
      if (!(await readyToSend(canConfirm))) return null;
      setSave({ ...IDLE, status: 'saving' });
      const outcome = await confirmInboxDocument(apiFetchRef.current, docId, tokenRef.current);
      // A confirmed invoice EXISTS whatever the panel shows now: always hand the answer back.
      if (outcome.status === 'confirmed') {
        if (idRef.current === docId && mountedRef.current) setSave(IDLE);
        return outcome.result;
      }
      if (idRef.current !== docId || !mountedRef.current) return null;
      await handleConfirmRefusal(outcome);
      return null;
    } catch (err) {
      failOnThrow(err, docId);
      return null;
    } finally {
      confirmingRef.current = false;
      if (mountedRef.current) setConfirming(false);
    }
  }, [failOnThrow, handleConfirmRefusal, readyToSend]);

  const retry = useCallback(async () => {
    writeFailedRef.current = false;
    lastAnswerRef.current = null;
    setSave(IDLE);
    const fresh = await refresh();
    if (fresh?.updated != null) tokenRef.current = fresh.updated;
  }, [refresh]);

  const dismissNotice = useCallback(() => setNotice(null), []);
  const dismissRefusal = useCallback(() => setRefusal(null), []);

  const entries = pendingState.id === id ? pendingState.entries : NO_ENTRIES;
  const review = useMemo(() => applyPendingToReview(server, entries), [server, entries]);
  const hasPending = entries.length > 0;
  const saving = save.status === 'saving' || hasPending || marking || confirming;

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
    confirming,
    notice,
    dismissNotice,
    refusal,
    dismissRefusal,
    commit,
    registerFlush,
    flush,
    markReviewed: markReviewedNow,
    confirm: confirmNow,
    retry,
  };
}
