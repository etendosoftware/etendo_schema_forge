/**
 * ETP-6049 — Invoice Inbox requests. Every call goes through the `apiFetch` the caller got from
 * `useApiFetch(apiBaseUrl)`, whose base is the spec (`/sws/neo/invoice-inbox`), so paths here are
 * relative to it: the list is `/header`, the upload is `/upload` (a built-in endpoint that NEO
 * dispatches before the spec router; the spec's CRUD is read-only), the discard is the action
 * `/header/{id}/action/discard`, the review read (ETP-6050) the GET action
 * `/header/{id}/action/review`, its edits the POST actions `/header/{id}/action/apply` and
 * `/header/{id}/action/mark-reviewed`, the confirm (ETP-6051) the POST action `/header/{id}/action/confirm` (contract: docs/plans/ETP-6050-invoice-inbox-review-panel.md 9.2).
 */
import { buildListQuery, COUNT_QUERIES, idsCriteria } from './invoiceInboxFilters.js';

export const LIST_PATH = '/header';
export const UPLOAD_PATH = '/upload';
/** Multipart part name the upload endpoint reads. */
export const UPLOAD_PART = 'files';
/** NEO action name of "Discard" (`InvoiceInboxHeaderHandler`). */
export const DISCARD_ACTION = 'discard';
/** NEO GET action that reads one document for the review panel (ETP-6050). */
export const REVIEW_ACTION = 'review';
/** NEO POST action that applies edit operations to a document (ETP-6050 S2). */
export const APPLY_ACTION = 'apply';
/** NEO POST action that marks a valid document as reviewed (ETP-6050 S2). */
export const MARK_REVIEWED_ACTION = 'mark-reviewed';
/** NEO POST action that confirms a document: creates the purchase invoice and completes it (ETP-6051). */
export const CONFIRM_ACTION = 'confirm';

const HTTP_FORBIDDEN = 403;

class InboxRequestError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.name = 'InboxRequestError';
    this.status = status;
  }
}

async function readList(apiFetch, query, signal) {
  const res = await apiFetch(`${LIST_PATH}?${query}`, { signal });
  if (!res.ok) throw new InboxRequestError(res.status);
  const json = await res.json();
  return { data: json?.response?.data ?? [], totalRows: json?.response?.totalRows ?? 0 };
}

/**
 * Reads up to `size` rows of one stream from `startRow`. Asks for one more row than needed and
 * keeps `size`, so `more` is known without a count.
 *
 * @returns {Promise<{rows: object[], more: boolean}>}
 */
export async function fetchStreamPage(apiFetch, criteria, startRow, size, signal) {
  const query = buildListQuery({ criteria, startRow, endRow: startRow + size });
  const { data } = await readList(apiFetch, query, signal);
  return { rows: data.slice(0, size), more: data.length > size };
}

/**
 * Reads the next page across ordered streams (one stream, or ERROR-then-rest for "all").
 *
 * @param {Function} apiFetch
 * @param {Array<Array<object>>} streams criteria of each stream, in order
 * @param {{index: number, offset: number}} cursor where the previous page stopped
 * @param {number} size rows wanted
 * @returns {Promise<{rows: object[], cursor: {index: number, offset: number}, more: boolean}>}
 */
export async function fetchNextPage(apiFetch, streams, cursor, size, signal) {
  const rows = [];
  let { index, offset } = cursor;
  while (index < streams.length && rows.length < size) {
    const page = await fetchStreamPage(apiFetch, streams[index], offset, size - rows.length, signal);
    rows.push(...page.rows);
    if (page.more) {
      offset += page.rows.length;
    } else {
      index += 1;
      offset = 0;
    }
  }
  return { rows, cursor: { index, offset }, more: index < streams.length };
}

/** Exact number of rows matching `criteria` (`_noCount=false`; one row read at most). */
export async function fetchCount(apiFetch, criteria, signal) {
  const query = buildListQuery({ criteria, startRow: 0, endRow: 1, exactCount: true });
  const { totalRows } = await readList(apiFetch, query, signal);
  return Number(totalRows) || 0;
}

/** Every filter counter except the derived `all`, in parallel. */
export async function fetchCounts(apiFetch, signal) {
  const entries = await Promise.all(
    Object.entries(COUNT_QUERIES).map(async ([key, criteria]) => [key, await fetchCount(apiFetch, criteria, signal)]),
  );
  return Object.fromEntries(entries);
}

/** Re-reads the given rows by id (polling of PROCESSING rows). */
export async function fetchRowsById(apiFetch, ids, signal) {
  const query = buildListQuery({ criteria: idsCriteria(ids), startRow: 0, endRow: ids.length });
  const { data } = await readList(apiFetch, query, signal);
  return data;
}

/**
 * Ids per `id inSet` request. 50 Etendo ids are ~2 KB once encoded, well under Tomcat's default
 * 8 KB request header limit; 100 would be ~4 KB with the rest of the query.
 */
export const IDS_PER_REQUEST = 50;

/** `fetchRowsById` in chunks of `IDS_PER_REQUEST`, in parallel; returns every row found. */
export async function fetchRowsByIdChunked(apiFetch, ids, signal) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) chunks.push(ids.slice(i, i + IDS_PER_REQUEST));
  const pages = await Promise.all(chunks.map((chunk) => fetchRowsById(apiFetch, chunk, signal)));
  return pages.flat();
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Discards ONE document: `POST /header/{id}/action/discard`, a NEO action served by
 * `InvoiceInboxHeaderHandler` (the spec's CRUD stays read-only). An already discarded document
 * answers 200 too (idempotent). Never throws for an HTTP answer; a request with no HTTP answer
 * rejects with the core `NetworkError` (already translated message).
 *
 * @returns {Promise<{status: 'discarded'} | {status: 'failed', code: string|null, httpStatus: number}>}
 *   `code` is the `error.code` of the NEO error envelope (`not_discardable`, `org_not_allowed`,
 *   `feature_disabled`, …), null when the answer carries none (router 403, plain 404)
 */
export async function discardInboxDocument(apiFetch, id) {
  const path = `${LIST_PATH}/${encodeURIComponent(id)}/action/${DISCARD_ACTION}`;
  // A write: no default timeout; `timeout: 0` says so explicitly (docs/request-policy.md).
  const res = await apiFetch(path, { method: 'POST', timeout: 0 });
  if (res.ok) return { status: 'discarded' };
  const json = await readJson(res);
  return { status: 'failed', code: json?.error?.code ?? null, httpStatus: res.status };
}

/**
 * ETP-6050 — reads ONE document for the review panel: `GET /header/{id}/action/review`, a NEO GET
 * action of `InvoiceInboxHeaderHandler` (the document, its recomputed validation, the enriched
 * candidates, the main attachment metadata, `updated`, `editable`). A read: the default timeout of
 * `apiFetch` applies. Never throws for an HTTP answer; a request with no HTTP answer rejects with
 * the core `NetworkError`, and an aborted one with an `AbortError`.
 *
 * @returns {Promise<{status: 'ok', review: object} | {status: 'failed', code: string|null,
 *   httpStatus: number}>} `code` is the `error.code` of the NEO error envelope (`processing` with
 *   409 while the document is still being read, `feature_disabled`, `not_found`, …)
 */
export async function fetchReview(apiFetch, id, signal) {
  const path = `${LIST_PATH}/${encodeURIComponent(id)}/action/${REVIEW_ACTION}`;
  const res = await apiFetch(path, { signal });
  const json = await readJson(res);
  if (res.ok && json) return { status: 'ok', review: json };
  return { status: 'failed', code: json?.error?.code ?? null, httpStatus: res.status };
}

/** The failed outcome every action shares: the NEO `error.code` and the details the codes carry. */
function failedOutcome(res, json) {
  const error = json?.error ?? {};
  // Detail keys (`field`, `index`, `max`, `missing`) sit directly in the `error` object; the row's
  // status of `not_editable` / `not_reviewable` is `error.documentStatus` (`error.status` is the HTTP code).
  const details = error;
  return {
    status: 'failed',
    // The generic NEO spec gate answers a role without (write) window access with a code-less 403
    // ({error:{message:'Access denied to spec for current role', status:403}}): derive the code, the
    // SPA translates by code and never shows the server's English text.
    code: error.code ?? (res.status === HTTP_FORBIDDEN ? 'access_denied' : null),
    httpStatus: res.status,
    field: details.field ?? null,
    index: Number.isInteger(details.index) ? details.index : null,
    missing: Array.isArray(details.missing) ? details.missing : null,
    documentStatus: details.documentStatus ?? null,
    // `not_valid` (422) carries the NEW token: adopt it without a reload.
    updated: details.updated ?? null,
  };
}

/**
 * ETP-6050 S2 — applies edit operations: `POST /header/{id}/action/apply` with
 * `{updated, operations}` (the optimistic-lock token travels in the BODY: `apiFetch` only injects
 * it into PUT/PATCH). The answer is the review body of the saved row, whose `updated` is the next
 * token. A write: `timeout: 0` (no default timeout, so a cut-off write cannot become a double
 * submit). Never throws for an HTTP answer; no HTTP answer rejects with the core `NetworkError`.
 *
 * @param {Function} apiFetch
 * @param {string} id document id
 * @param {string} updated the token of the last answer
 * @param {object[]} operations 1 to 50 operations (`buildOp` in invoiceInboxReviewModel.js)
 * @param {AbortSignal} [signal]
 * @returns {Promise<{status: 'ok', review: object} | {status: 'failed', code: string|null,
 *   httpStatus: number, field: string|null, index: number|null, missing: string[]|null,
 *   documentStatus: string|null}>}
 */
export async function applyOperations(apiFetch, id, updated, operations, signal) {
  const path = `${LIST_PATH}/${encodeURIComponent(id)}/action/${APPLY_ACTION}`;
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify({ updated, operations }), timeout: 0, signal });
  const json = await readJson(res);
  if (res.ok && json) return { status: 'ok', review: json };
  return failedOutcome(res, json);
}

/**
 * ETP-6050 S2 — marks a valid document as reviewed: `POST /header/{id}/action/mark-reviewed` with
 * `{updated}`. Same outcome shape as `applyOperations` (`not_valid` 422 carries `missing`;
 * `not_reviewable` 409 carries `documentStatus`).
 */
export async function markReviewed(apiFetch, id, updated, signal) {
  const path = `${LIST_PATH}/${encodeURIComponent(id)}/action/${MARK_REVIEWED_ACTION}`;
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify({ updated }), timeout: 0, signal });
  const json = await readJson(res);
  if (res.ok && json) return { status: 'ok', review: json };
  return failedOutcome(res, json);
}

/**
 * ETP-6051 — confirms ONE document: `POST /header/{id}/action/confirm`, optionally with `{updated}`
 * (the review panel sends its token, the batch sends none). The server creates the vendor, the new
 * products and the purchase invoice, completes it and links it, all or nothing. 200 answers
 * `{id, status: 'CONFIRMED', invoice: {id, documentNo, identifier}, adjusted, createdVendor,
 * createdProducts, alreadyConfirmed}`. A write: `timeout: 0`. Never throws for an HTTP answer; no
 * HTTP answer rejects with the core `NetworkError`.
 *
 * @param {Function} apiFetch
 * @param {string} id document id
 * @param {string|null} [updated] optimistic-lock token, sent only when known
 * @returns {Promise<{status: 'confirmed', result: object} | {status: 'failed', code: string|null,
 *   httpStatus: number, missing: string[]|null, updated: string|null, detail: string|null,
 *   detailInfo: {code: string, params: object}|null, invoice: object|null}>} `detail` is the English reason of
 *   `confirm_failed` and `detailInfo` its identifier (`error.detailCode` / `error.detailParams`, translated by
 *   `confirmFailedDetail`), `invoice` the existing one of `duplicate_invoice`
 */
export async function confirmInboxDocument(apiFetch, id, updated = null) {
  const path = `${LIST_PATH}/${encodeURIComponent(id)}/action/${CONFIRM_ACTION}`;
  const init = { method: 'POST', timeout: 0 };
  if (updated != null) init.body = JSON.stringify({ updated });
  const res = await apiFetch(path, init);
  const json = await readJson(res);
  if (res.ok && json) return { status: 'confirmed', result: json };
  const error = json?.error ?? {};
  return {
    ...failedOutcome(res, json),
    detail: error.detail ?? null,
    detailInfo: error.detailCode ? { code: error.detailCode, params: error.detailParams ?? {} } : null,
    invoice: error.invoice ?? null,
  };
}

/**
 * Uploads ONE file. Never throws for an HTTP answer; a request with no HTTP answer rejects with
 * the core `NetworkError` (already translated message).
 *
 * @returns {Promise<{status: 'accepted', id: string} | {status: 'rejected', code: string|null}
 *   | {status: 'failed', code: string|null}>} `rejected` = the file was refused (200 answer);
 *   `failed` = the whole request was refused (non-2xx, `error.code`)
 */
export async function uploadInboxFile(apiFetch, file) {
  const form = new FormData();
  form.append(UPLOAD_PART, file, file.name);
  // A write: no default timeout; `timeout: 0` says so explicitly (docs/request-policy.md).
  const res = await apiFetch(UPLOAD_PATH, { method: 'POST', body: form, timeout: 0 });
  const json = await readJson(res);
  if (!res.ok) return { status: 'failed', code: json?.error?.code ?? null };
  const result = json?.results?.[0];
  if (result?.status === 'accepted') return { status: 'accepted', id: result.incomingDocumentId };
  return { status: 'rejected', code: result?.code ?? null };
}
