import { useCallback, useEffect, useRef, useState } from 'react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { discardInboxDocument } from './invoiceInboxApi.js';
import { isSelectableRow } from './invoiceInboxFilters.js';
import {
  DISCARD_FALLBACK_KEY,
  DISCARD_STOPPING_CODES,
  discardFailureCode,
  discardReasonKey,
} from './invoiceInboxMessages.js';

/** Documents discarded at the same time. One request per document. */
export const DISCARD_CONCURRENCY = 3;

const NETWORK_CODE = 'network';

/**
 * Discards one row. Never throws.
 *
 * @returns {Promise<{ok: true} | {ok: false, failure: object, stops: boolean}>} `failure` is
 *   `{id, fileName, code, reasonKey}` or, for a network error, `{…, reasonText}` (already translated)
 */
export async function discardRow(apiFetch, row) {
  const base = { id: row.id, fileName: row.fileName };
  try {
    const outcome = await discardInboxDocument(apiFetch, row.id);
    if (outcome.status === 'discarded') return { ok: true };
    const code = discardFailureCode(outcome);
    return {
      ok: false,
      failure: { ...base, code, reasonKey: discardReasonKey(code) },
      stops: DISCARD_STOPPING_CODES.has(code),
    };
  } catch (err) {
    if (isNetworkError(err)) {
      return { ok: false, failure: { ...base, code: NETWORK_CODE, reasonText: err.message }, stops: true };
    }
    return { ok: false, failure: { ...base, code: null, reasonKey: DISCARD_FALLBACK_KEY }, stops: false };
  }
}

/**
 * Discards `rows`, one request each, `concurrency` at a time. A refusal that no other row can
 * escape (flag off, role without write access, network down) stops the batch: the rows not sent
 * yet are left out (`notSent`). `isActive()` false (the page left) also stops sending.
 *
 * @returns {Promise<{total: number, ok: string[], failed: object[], stopped: object|null,
 *   notSent: string[]}>} `stopped` is the failure that stopped the batch
 */
export async function runDiscardQueue(apiFetch, rows, { concurrency = DISCARD_CONCURRENCY, isActive = () => true } = {}) {
  const queue = [...rows];
  const result = { total: rows.length, ok: [], failed: [], stopped: null, notSent: [] };
  const worker = async () => {
    while (queue.length && !result.stopped && isActive()) {
      const row = queue.shift();
      const outcome = await discardRow(apiFetch, row);
      if (outcome.ok) {
        result.ok.push(row.id);
      } else {
        result.failed.push(outcome.failure);
        if (outcome.stops && !result.stopped) result.stopped = outcome.failure;
      }
    }
  };
  const workers = Math.min(concurrency, queue.length);
  await Promise.all(Array.from({ length: workers }, worker));
  result.notSent = queue.map((row) => row.id);
  return result;
}

/** The reason of a failed batch: the stopping one, the shared one, or none (several reasons). */
function batchReason(result) {
  if (result.stopped) return result.stopped;
  const codes = new Set(result.failed.map((failure) => failure.code));
  return codes.size === 1 ? result.failed[0] : { reasonKey: DISCARD_FALLBACK_KEY };
}

/**
 * The toast of a finished batch (pure). `reason` is `{reasonKey}` (an i18n key) or `{reasonText}`
 * (already translated); the caller resolves it into `params.reason`.
 *
 * @returns {{tone: 'success'|'warning'|'error', key: string, params: object,
 *   reason: {reasonKey?: string, reasonText?: string}|null}}
 */
export function discardToast(result) {
  const okCount = result.ok.length;
  const failedCount = result.total - okCount;
  if (failedCount === 0) {
    return okCount === 1
      ? { tone: 'success', key: 'invoiceInboxDiscardedOne', params: {}, reason: null }
      : { tone: 'success', key: 'invoiceInboxDiscardedMany', params: { count: okCount }, reason: null };
  }
  const reason = batchReason(result);
  if (okCount === 0) return { tone: 'error', key: 'invoiceInboxDiscardFailed', params: {}, reason };
  return {
    tone: 'warning',
    key: 'invoiceInboxDiscardPartial',
    params: { ok: okCount, total: result.total, failed: failedCount },
    reason,
  };
}

/**
 * ETP-6049 — the discard of the Invoice Inbox: one request per document, three at a time
 * (`runDiscardQueue`). Only PENDING_REVIEW / ERROR / READY rows are sent (`isSelectableRow`, a
 * defence: the table never lets the others be picked). `running` blocks a second batch while one
 * is in flight (double click). Leaving the page stops sending; `discard` then still resolves,
 * and the caller must not touch its state (check its own mounted flag).
 *
 * @param {Function} apiFetch from `useApiFetch(apiBaseUrl)`
 * @returns {{discard: (rows: object[]) => Promise<object|null>, running: boolean}} `discard`
 *   resolves to the batch result, or null when a batch is already running
 */
export function useInvoiceInboxDiscard(apiFetch) {
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const discard = useCallback(async (rows) => {
    if (runningRef.current) return null;
    runningRef.current = true;
    setRunning(true);
    try {
      const targets = (rows ?? []).filter(isSelectableRow);
      return await runDiscardQueue(apiFetch, targets, { isActive: () => mountedRef.current });
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setRunning(false);
    }
  }, [apiFetch]);

  return { discard, running };
}
