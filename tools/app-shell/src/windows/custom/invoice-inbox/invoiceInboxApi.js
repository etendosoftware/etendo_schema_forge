/**
 * ETP-6049 — Invoice Inbox requests. Every call goes through the `apiFetch` the caller got from
 * `useApiFetch(apiBaseUrl)`, whose base is the spec (`/sws/neo/invoice-inbox`), so paths here are
 * relative to it: the list is `/header`, the upload is `/upload` (a built-in endpoint that NEO
 * dispatches before the spec router; the spec's CRUD is read-only), the discard is the action
 * `/header/{id}/action/discard`.
 */
import { buildListQuery, COUNT_QUERIES, idsCriteria } from './invoiceInboxFilters.js';

export const LIST_PATH = '/header';
export const UPLOAD_PATH = '/upload';
/** Multipart part name the upload endpoint reads. */
export const UPLOAD_PART = 'files';
/** NEO action name of "Discard" (`InvoiceInboxHeaderHandler`). */
export const DISCARD_ACTION = 'discard';

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
