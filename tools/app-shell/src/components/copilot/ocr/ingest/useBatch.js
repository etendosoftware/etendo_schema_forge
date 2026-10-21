import { useCallback, useMemo, useState } from 'react';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { getNeoBaseUrl } from '@/lib/neoBaseUrl.js';

/** Seconds between polls of a running job. */
const JOB_POLL_INTERVAL_MS = 2000;
/** Consecutive failed polls tolerated before the answer is reported unknown. */
const MAX_CONSECUTIVE_POLL_FAILURES = 5;
/** Resubmits after a 429 before giving up. */
const MAX_SUBMIT_RETRIES = 12;
/** Longest wait between resubmits, whatever `Retry-After` says. */
const MAX_RETRY_WAIT_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function readJson(res) {
  return parseJson(await res.text().catch(() => ''));
}

/** One POST of the batch payload; `timeout: 0` because a synchronous batch can outlive the default. */
async function postJson(apiFetch, url, payload) {
  const res = await apiFetch(url, {
    baseUrl: '',
    method: 'POST',
    body: JSON.stringify(payload),
    timeout: 0,
  });
  const text = await res.text().catch(() => '');
  return { res, json: parseJson(text), text };
}

/**
 * Submits an async batch. A 429 means the user already has the maximum of active jobs (or the
 * server queue is full): wait the advertised time and resubmit instead of failing the rows.
 */
async function submitWithBackoff(apiFetch, url, payload, pollIntervalMs) {
  for (let attempt = 0; ; attempt += 1) {
    const out = await postJson(apiFetch, url, payload);
    if (out.res.status !== 429 || attempt >= MAX_SUBMIT_RETRIES) return out;
    const advertised = Number(out.res.headers?.get?.('Retry-After'));
    const waitMs = Number.isFinite(advertised) && advertised > 0
      ? Math.min(advertised * 1000, MAX_RETRY_WAIT_MS)
      : Math.max(pollIntervalMs, 1000);
    await sleep(waitMs);
  }
}

/** The error a caller already knows how to classify (`importErrorServerFailure`). */
function jobError(status, message, raw) {
  const err = new Error(message);
  err.raw = raw;
  err.messageKey = 'importErrorServerFailure';
  err.params = { status };
  return err;
}

/** Folds a finished job into the envelope `runBatch` callers read. */
function envelopeFromJob(job) {
  const rows = Array.isArray(job.rows) ? job.rows : [];
  if (job.state === 'SUCCEEDED') {
    return {
      committed: true,
      operations: rows.flatMap((row) => (Array.isArray(row.operations) ? row.operations : [])),
    };
  }
  const firstFailed = rows.find((row) => row && row.committed === false);
  const envelope = { committed: false, partial: true, state: job.state, rows, hint: job.hint };
  if (firstFailed?.error) envelope.error = firstFailed.error;
  if (firstFailed?.failedAt) envelope.failedAt = firstFailed.failedAt;
  return envelope;
}

/**
 * Polls a job until it is done. A transient poll failure does not abort the wait — the job lives
 * on the server — but five in a row throw, which the import engine reads as "outcome unknown"
 * (rows are never resent, so nothing is duplicated). A 404 means the job is gone.
 */
async function pollJob(apiFetch, url, { onProgress, pollIntervalMs }) {
  let failures = 0;
  for (;;) {
    let res;
    try {
      res = await apiFetch(url, { baseUrl: '', method: 'GET' });
    } catch (e) {
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw e;
      await sleep(pollIntervalMs);
      continue;
    }
    const job = await readJson(res);
    if (res.status === 404) throw jobError(404, `Batch job not found (${res.status})`, undefined);
    if (!res.ok || !job) {
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw jobError(res.status, `Batch job status failed (${res.status})`, undefined);
      }
      await sleep(pollIntervalMs);
      continue;
    }
    failures = 0;
    onProgress?.({ processedRows: job.processedRows ?? 0, totalRows: job.totalRows ?? 0 });
    if (job.done) return envelopeFromJob(job);
    await sleep(pollIntervalMs);
  }
}

/**
 * Drives the generic transactional batch endpoint.
 *
 *   POST /sws/neo/batch
 *     body: { operations: [{ id, spec, entity, body, parentRef? }, ...], _onlyReturnIds?,
 *             _skipRedundantCallouts? }
 *
 * Returns one of:
 *   { committed: true, operations: [{ id, recordId, ok: true }, ...] }
 *   { committed: false, failedAt: { id, index }, error: { status, message, detail } }
 *
 * Find-or-create logic lives in the caller (typically a per-window descriptor).
 * This hook does no orchestration beyond POST + JSON parsing — the same shape
 * an MCP agent would use when calling a `etendo_batch` tool.
 *
 * `runBatch(operations, { onlyReturnIds })` — ETP-5676: `onlyReturnIds: true` sends the request
 * option `_onlyReturnIds`, which lets every create skip decorating the record it echoes back. The
 * response shape is the same either way (ids only); send it only from a caller that never reads
 * more than `committed`, `operations[].recordId` and the failure envelope.
 *
 * `skipRedundantCallouts: true` sends `_skipRedundantCallouts`: the server may skip a create-cascade
 * callout once an earlier operation of the same batch showed that every value it writes is
 * overwritten by the caller's own fields. Opt-in, and a server-side kill switch can ignore it.
 *
 * `async: true` (ETP-5677) sends `async:true`: the server answers `202 {jobId}` at once, a background
 * job writes the operations ROW BY ROW (a row = an operation plus what it references), and this hook
 * polls `GET /batch/jobs/{jobId}` until the job is done. A long batch can therefore never lose its
 * answer to a proxy idle-timeout. The resolved value keeps the shape callers already read:
 *   - every row committed → `{ committed: true, operations: [...] }`;
 *   - otherwise → `{ committed: false, partial: true, state, rows, error?, failedAt?, hint? }`, where
 *     `rows[]` says per row (`ids`, `committed`, `operations` | `error`) what exists. No `atomic`
 *     key: some rows may exist, so a caller that predates `rows` must not treat it as a rollback.
 * `onProgress({ processedRows, totalRows })` is called after every poll. A server that does not know
 * `async` answers synchronously; that answer is returned as it is. A 429 (too many active jobs) is
 * waited out with the server's `Retry-After` and resubmitted — it never becomes a row error.
 */
export function useBatch({ token }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const apiFetch = useApiFetch('');

  // The /batch endpoint lives at the NEO root, not under any spec, so it is asked for directly
  // rather than derived from the caller's own base URL.
  //
  // ETP-5371 — this used to strip the last segment off the host spec's URL
  // (`/etendo/sws/neo/product` → `/etendo/sws/neo`), which silently carried the assumption that
  // every caller passes a spec URL. `FirstStepsImportButton` passed the deployment prefix
  // (`/etendo`), so the chop produced `''` and the POST went to `/batch` — a URL outside the
  // backend entirely, which CloudFront rejected with a 403 that read like an infrastructure
  // outage. The derivation could not tell a right answer from a wrong one because both are
  // strings, so it no longer derives: the NEO root has one owner now.
  const batchUrl = useMemo(() => `${getNeoBaseUrl()}/batch`, []);

  const runBatch = useCallback(async (operations, {
    onlyReturnIds = false,
    skipRedundantCallouts = false,
    async: asyncMode = false,
    onProgress,
    pollIntervalMs = JOB_POLL_INTERVAL_MS,
  } = {}) => {
    setError(null);
    setLoading(true);
    try {
      // ETP-5424 — one /batch POST is a single transaction over many operations and can
      // outlive apiFetch's default timeout. Cutting it off client-side would report rows as
      // failed while the transaction may still commit, so the send opts out.
      const payload = { operations };
      if (onlyReturnIds) payload._onlyReturnIds = true;
      if (skipRedundantCallouts) payload._skipRedundantCallouts = true;
      if (asyncMode) payload.async = true;
      const { res, json, text } = asyncMode
        ? await submitWithBackoff(apiFetch, batchUrl, payload, pollIntervalMs)
        : await postJson(apiFetch, batchUrl, payload);
      if (asyncMode && json?.jobId && !('committed' in json)) {
        return await pollJob(apiFetch, `${batchUrl}/jobs/${encodeURIComponent(json.jobId)}`, {
          onProgress,
          pollIntervalMs,
        });
      }
      if (!res.ok && !json) {
        // A non-ok response whose body isn't even valid JSON is a genuinely uncontrolled
        // failure (a raw Tomcat/servlet-container error page, an unhandled exception's
        // stack trace as plain text) — as opposed to BatchService.java's own graceful
        // `{ committed: false, ... }` JSON failure, which is returned above, not thrown.
        // The raw text is the only diagnostic available for this case; preserving it as
        // `.raw` lets the import UI show it instead of just a bare "Batch failed (500)".
        const err = new Error(`Batch failed (${res.status})`);
        err.raw = text;
        // ETP-5350 — the sentence above is a developer-facing diagnostic, and until the
        // import engine started classifying rejections it was ALSO what the user read, in
        // English, in the review queue and in the blocking system-error dialog. The engine
        // can now recover the status by parsing it back out of the prose, but declaring the
        // key here means it never has to: the throw site knows the status, so it says so.
        err.messageKey = 'importErrorServerFailure';
        err.params = { status: res.status };
        throw err;
      }
      return json;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [batchUrl, apiFetch]);

  return { runBatch, loading, error };
}

export default useBatch;
