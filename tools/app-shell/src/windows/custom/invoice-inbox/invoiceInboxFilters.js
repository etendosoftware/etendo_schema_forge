/**
 * ETP-6049 — Invoice Inbox list filters, as NEO `criteria` (pure, no React, no `@/` imports, so
 * plain `node --test` can cover it).
 *
 * The status codes are the `ETGO_INCOMING_DOCUMENT.Status` reference list. Filters are fixed
 * views, not user-built conditions:
 *   - all        every status except DISCARDED, with ERROR rows first (two streams, see below)
 *   - pending    PROCESSING + PENDING_REVIEW + READY (work in progress, not yet failed)
 *   - error      ERROR
 *   - confirmed  CONFIRMED
 *   - discarded  DISCARDED
 *
 * "Errors first" in `all`: `_sortBy` only accepts property paths, and sorting by `status`
 * alphabetically does not put ERROR first. So `all` reads two disjoint streams in order, each
 * newest first: ERROR rows, then the rest. Paging walks the first stream until it runs out, then
 * the second. A stored sort-priority column would collapse this into one request (next step N3 in
 * docs/generated-custom-windows/invoice-inbox.md).
 */

export const STATUS = Object.freeze({
  PROCESSING: 'PROCESSING',
  PENDING_REVIEW: 'PENDING_REVIEW',
  ERROR: 'ERROR',
  READY: 'READY',
  CONFIRMED: 'CONFIRMED',
  DISCARDED: 'DISCARDED',
});

const STATUS_FIELD = 'status';
const PENDING_STATUSES = [STATUS.PROCESSING, STATUS.PENDING_REVIEW, STATUS.READY];
const ALL_BUT_ERROR_STATUSES = [...PENDING_STATUSES, STATUS.CONFIRMED];

/** Newest first. `created` is always readable on a NEO entity (alias of creationDate). */
export const SORT_NEWEST_FIRST = '-created';

/** Rows per page of the list. */
export const PAGE_SIZE = 50;

/** Extra property that brings the linked vendor's tax id as `businessPartner$taxID`. */
export const EXTRA_PROPERTIES = 'businessPartner.taxID';

function equalsStatus(value) {
  return { fieldName: STATUS_FIELD, operator: 'equals', value };
}

function statusIn(values) {
  return { fieldName: STATUS_FIELD, operator: 'inSet', value: values };
}

/** The filter tabs, in display order. `labelKey` is a `genericLabels` key. */
export const INBOX_FILTERS = Object.freeze([
  { key: 'all', labelKey: 'invoiceInboxFilterAll', streams: [[equalsStatus(STATUS.ERROR)], [statusIn(ALL_BUT_ERROR_STATUSES)]] },
  { key: 'pending', labelKey: 'invoiceInboxFilterPending', streams: [[statusIn(PENDING_STATUSES)]] },
  { key: 'error', labelKey: 'invoiceInboxFilterError', streams: [[equalsStatus(STATUS.ERROR)]] },
  { key: 'confirmed', labelKey: 'invoiceInboxFilterConfirmed', streams: [[equalsStatus(STATUS.CONFIRMED)]] },
  { key: 'discarded', labelKey: 'invoiceInboxFilterDiscarded', streams: [[equalsStatus(STATUS.DISCARDED)]] },
]);

export const DEFAULT_FILTER = 'all';

/** The filter definition for a key; unknown keys fall back to `all`. */
export function filterByKey(key) {
  return INBOX_FILTERS.find((f) => f.key === key) ?? INBOX_FILTERS[0];
}

/**
 * The counter requests: one per filter except `all`, which is their sum (every status but
 * DISCARDED is in exactly one of pending/error/confirmed).
 */
export const COUNT_QUERIES = Object.freeze({
  pending: [statusIn(PENDING_STATUSES)],
  error: [equalsStatus(STATUS.ERROR)],
  confirmed: [equalsStatus(STATUS.CONFIRMED)],
  discarded: [equalsStatus(STATUS.DISCARDED)],
});

/** Adds the derived `all` counter. Returns null while any counter is unknown. */
export function withAllCount(counts) {
  if (!counts) return null;
  const { pending, error, confirmed } = counts;
  if ([pending, error, confirmed].some((n) => typeof n !== 'number')) return null;
  return { ...counts, all: pending + error + confirmed };
}

/** The number next to the page title: what still needs work (pending + with errors). */
export function workCount(counts) {
  if (!counts || typeof counts.pending !== 'number' || typeof counts.error !== 'number') return null;
  return counts.pending + counts.error;
}

/** Rows that can be checked for a batch action. PROCESSING, CONFIRMED and DISCARDED cannot. */
const SELECTABLE_STATUSES = new Set([STATUS.PENDING_REVIEW, STATUS.READY, STATUS.ERROR]);

export function isSelectableRow(row) {
  return SELECTABLE_STATUSES.has(row?.status);
}

export function isProcessingRow(row) {
  return row?.status === STATUS.PROCESSING;
}

/**
 * Query string of a list read.
 *
 * @param {object} opts
 * @param {Array<object>} opts.criteria
 * @param {number} opts.startRow
 * @param {number} opts.endRow
 * @param {boolean} [opts.exactCount] `_noCount=false`: core runs a real count (a counter needs
 *   it; without it totalRows is an estimate of rows read + 1)
 * @returns {string}
 */
export function buildListQuery({ criteria, startRow, endRow, exactCount = false }) {
  const params = new URLSearchParams({
    _startRow: String(startRow),
    _endRow: String(endRow),
    _sortBy: SORT_NEWEST_FIRST,
  });
  if (exactCount) params.set('_noCount', 'false');
  else params.set('_extraProperties', EXTRA_PROPERTIES);
  if (criteria?.length) params.set('criteria', JSON.stringify(criteria));
  return params.toString();
}

/** Criteria that re-read the given rows (polling of PROCESSING rows). */
export function idsCriteria(ids) {
  return [{ fieldName: 'id', operator: 'inSet', value: ids }];
}
