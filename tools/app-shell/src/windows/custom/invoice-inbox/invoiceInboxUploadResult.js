/**
 * ETP-6049 — "Resultado de tus cargas": what became of the documents this browser uploaded
 * (pure, `node --test`-able). The rows come from the server (`id inSet`); a recorded id the
 * server does not return any more is "no longer available".
 *
 * Buckets: read = PENDING_REVIEW or READY; failed = ERROR (by `errorCode`); pending = PROCESSING or
 * not read from the server yet; handled = CONFIRMED or DISCARDED; gone = not returned.
 */
import { STATUS } from './invoiceInboxFilters.js';

const READ = new Set([STATUS.PENDING_REVIEW, STATUS.READY]);
const HANDLED = new Set([STATUS.CONFIRMED, STATUS.DISCARDED]);

/** Fresh rows keyed by the ids that were asked for; an id the server did not return maps to null. */
export function rowsByRequestedId(ids, fresh) {
  const byId = new Map((fresh ?? []).map((row) => [row.id, row]));
  return new Map((ids ?? []).map((id) => [id, byId.get(id) ?? null]));
}

/** The bucket of one recorded id, from its row (`undefined` = not read yet, `null` = gone). */
export function resultBucket(row) {
  if (row === undefined) return 'pending';
  if (row === null) return 'gone';
  if (row.status === STATUS.ERROR) return 'failed';
  if (READ.has(row.status)) return 'read';
  if (HANDLED.has(row.status)) return 'handled';
  return 'pending';
}

function failedReasons(ids, rowsById) {
  const byCode = new Map();
  for (const id of ids) {
    const row = rowsById.get(id);
    if (resultBucket(row) !== 'failed') continue;
    const code = row.errorCode || 'UNKNOWN';
    byCode.set(code, (byCode.get(code) ?? 0) + 1);
  }
  return [...byCode.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/**
 * Counts of the recorded documents.
 *
 * @param {string[]} ids recorded document ids
 * @param {Map<string, object|null>} rowsById what the server returned (see `rowsByRequestedId`)
 * @returns {{total:number, read:number, failed:number, pending:number, handled:number, gone:number,
 *   reasons: Array<{code:string, count:number}>, failedIds: string[], pendingIds: string[]}}
 */
export function summarizeUploadResult(ids, rowsById) {
  const summary = { total: ids.length, read: 0, failed: 0, pending: 0, handled: 0, gone: 0, failedIds: [], pendingIds: [] };
  for (const id of ids) {
    const bucket = resultBucket(rowsById.get(id));
    summary[bucket] += 1;
    if (bucket === 'failed') summary.failedIds.push(id);
    if (bucket === 'pending') summary.pendingIds.push(id);
  }
  return { ...summary, reasons: failedReasons(ids, rowsById) };
}

/**
 * Which state the panel is in: `reading` (nothing finished yet), `mixed` (some finished, some still
 * read), `done` (everything finished, no error), `doneWithErrors`.
 */
export function resultState(summary) {
  const finished = summary.read + summary.failed;
  if (summary.pending > 0) return finished > 0 ? 'mixed' : 'reading';
  return summary.failed > 0 ? 'doneWithErrors' : 'done';
}
