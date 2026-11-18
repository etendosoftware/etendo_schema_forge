import { useCallback, useEffect, useRef, useState } from 'react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { isTotalMismatch } from './invoiceInboxConfirmModel.js';
import { confirmInboxDocument } from './invoiceInboxApi.js';
import { isConfirmableRow } from './invoiceInboxFilters.js';
import {
  CONFIRM_FALLBACK_KEY,
  CONFIRM_STOPPING_CODES,
  confirmReasonKey,
  discardFailureCode,
} from './invoiceInboxMessages.js';

const NETWORK_CODE = 'network';

/**
 * Confirms one row. Never throws.
 *
 * @returns {Promise<{ok: true, entry: object} | {ok: false, failure: object, stops: boolean}>}
 *   `entry` is `{id, documentNo, invoiceId, createdProducts, createdVendor, alreadyConfirmed}`;
 *   `failure` is `{id, fileName, code, reasonKey, detail}` or, for a network error, `{…, reasonText}`
 *   (already translated)
 */
export async function confirmRow(apiFetch, row) {
  const base = { id: row.id, fileName: row.fileName };
  try {
    const outcome = await confirmInboxDocument(apiFetch, row.id);
    if (outcome.status === 'confirmed') {
      const { result } = outcome;
      return {
        ok: true,
        entry: {
          id: row.id,
          documentNo: result.invoice?.documentNo ?? null,
          invoiceId: result.invoice?.id ?? null,
          createdProducts: Number(result.createdProducts) || 0,
          createdVendor: Boolean(result.createdVendor),
          alreadyConfirmed: Boolean(result.alreadyConfirmed),
          totalMismatch: isTotalMismatch(result.totalMismatch),
        },
      };
    }
    const code = discardFailureCode(outcome);
    return {
      ok: false,
      failure: { ...base, code, reasonKey: confirmReasonKey(code), detail: outcome.detail ?? null },
      stops: CONFIRM_STOPPING_CODES.has(code),
    };
  } catch (err) {
    if (isNetworkError(err)) {
      return { ok: false, failure: { ...base, code: NETWORK_CODE, reasonText: err.message }, stops: true };
    }
    return { ok: false, failure: { ...base, code: null, reasonKey: CONFIRM_FALLBACK_KEY }, stops: false };
  }
}

/**
 * Confirms `rows` ONE AT A TIME (contiguous document numbering: the completion takes the next
 * number of the sequence, so two in parallel would interleave). Each failure is isolated and the
 * rest continue; a refusal no other row can escape (flag off, no access, quota, network down) stops
 * the run and the rows not sent yet are left out (`notSent`). `isActive()` false (the page left)
 * also stops sending. `onProgress({done, total})` runs before the first request and after each one.
 *
 * @returns {Promise<{total: number, ok: object[], failed: object[], stopped: object|null,
 *   notSent: string[]}>} `stopped` is the failure that stopped the run
 */
export async function runConfirmQueue(apiFetch, rows, { isActive = () => true, onProgress } = {}) {
  const queue = [...rows];
  const result = { total: rows.length, ok: [], failed: [], stopped: null, notSent: [] };
  onProgress?.({ done: 0, total: result.total });
  while (queue.length && !result.stopped && isActive()) {
    const row = queue.shift();
    const outcome = await confirmRow(apiFetch, row);
    if (outcome.ok) {
      result.ok.push(outcome.entry);
    } else {
      result.failed.push(outcome.failure);
      if (outcome.stops) result.stopped = outcome.failure;
    }
    onProgress?.({ done: result.ok.length + result.failed.length, total: result.total });
  }
  result.notSent = queue.map((row) => row.id);
  return result;
}

/**
 * ETP-6051 — the batch confirm of the Invoice Inbox: one request per document, sequential
 * (`runConfirmQueue`). Only confirmable rows are sent (`isConfirmableRow`, a defence: the dialog
 * already counts the others as skipped). `running` blocks a second run (double click) and
 * `progress` is `{done, total}` while one is in flight. Leaving the page stops sending; `confirm`
 * then still resolves, and the caller must not touch its state (check its own mounted flag).
 *
 * @param {Function} apiFetch from `useApiFetch(apiBaseUrl)`
 * @returns {{confirm: (rows: object[]) => Promise<object|null>, running: boolean,
 *   progress: {done: number, total: number}|null}} `confirm` resolves to the run result, or null
 *   when a run is already in flight
 */
export function useInvoiceInboxConfirm(apiFetch) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const confirm = useCallback(async (rows) => {
    if (runningRef.current) return null;
    runningRef.current = true;
    setRunning(true);
    try {
      const targets = (rows ?? []).filter(isConfirmableRow);
      const onProgress = (next) => { if (mountedRef.current) setProgress(next); };
      return await runConfirmQueue(apiFetch, targets, { isActive: () => mountedRef.current, onProgress });
    } finally {
      runningRef.current = false;
      if (mountedRef.current) {
        setRunning(false);
        setProgress(null);
      }
    }
  }, [apiFetch]);

  return { confirm, running, progress };
}
