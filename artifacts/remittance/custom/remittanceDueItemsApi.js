// ETP-6148 — «Seleccionar desde factura»: the remittance-header actions behind the due-item
// picker, served by RemittanceHeaderHandler (com.etendoerp.go). Pure functions over an injected
// `apiFetch` (the shared helper from `useApiFetch(apiBaseUrl)`), so the modal stays thin and these
// can be unit-tested without React.
//
// Contract (NEO action envelope `{ response: { data } }`, read defensively):
//   POST /remittance/{id}/action/availableDueItems  { search, page, pageSize }
//     → { items: [{ id, documentNo, invoiceId, salesTransaction, invoiceDate,
//                   dueDate, dueStatus (OVERDUE | DUE_TODAY | PENDING), businessPartner,
//                   businessPartnerId, grandTotalAmount, outstandingAmount (the due's maximum),
//                   currency, alreadyInRemittance, lineAmount, lineIds }], total }
//     Dues already in this remittance always come back (alreadyInRemittance, with lineAmount =
//     the sum of their lines and lineIds), so the picker can manage them.
//   POST /remittance/{id}/action/syncDueItems       { items: [{ id, amount }], remove: [id] }
//     → { created, updated, removed, message }    one transaction
//   Refusals are 422s with `messageKeys` (see dueItemsErrorMessage). The backend also keeps the
//   older add-only `selectDueItems` action; the SPA no longer calls it.

import {
  translateBackendError,
  extractBackendMessageKeys,
  extractBackendMessageParams,
} from '@/lib/backendErrors.js';

/** Index of the first page sent to `availableDueItems` (1-based; the action defaults to 1, page size default 50, max 200). */
export const FIRST_PAGE = 1;
export const DUE_ITEMS_PAGE_SIZE = 20;

const actionPath = (remittanceId, action) =>
  `/remittance/${encodeURIComponent(remittanceId)}/action/${action}`;

/** The action's payload, whether or not NEO wrapped it in `response.data`. */
function unwrap(json) {
  return json?.response?.data ?? json?.data ?? json ?? {};
}

async function readJsonSafely(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * A translated message for a refused action, from its `messageKeys` first and its text second.
 *
 * @param {object|null} body - the parsed error body
 * @param {Function} ui - the `useUI()` translator
 * @param {string} fallbackKey - i18n key used when nothing better is available
 * @returns {string}
 */
export function dueItemsErrorMessage(body, ui, fallbackKey) {
  const text = body?.error?.message ?? body?.message ?? '';
  const translated = translateBackendError(text, ui, {
    code: body?.error?.code ?? body?.code,
    messageKeys: extractBackendMessageKeys(body),
    messageParams: extractBackendMessageParams(body),
  });
  return translated || ui(fallbackKey);
}

/**
 * One page of the due items the remittance can take.
 *
 * @returns {Promise<{ items: object[], total: number|null }>}
 * @throws {Error} with `body` when the backend refuses
 */
export async function fetchDueItemsPage(apiFetch, remittanceId, { search = '', page = FIRST_PAGE, pageSize = DUE_ITEMS_PAGE_SIZE } = {}) {
  const res = await apiFetch(actionPath(remittanceId, 'availableDueItems'), {
    method: 'POST',
    body: JSON.stringify({ search, page, pageSize }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`availableDueItems ${res.status}`), { status: res.status, body: await readJsonSafely(res) });
  }
  const data = unwrap(await res.json());
  const items = Array.isArray(data) ? data : (data.items ?? []);
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : null;
  return { items, total };
}

/**
 * ETP-6148 — the remittance's lines total over ALL its lines, not just the loaded page: the lines
 * list with core's grid summary (`_summary={"amount":"sum","id":"count"}`), which answers one
 * row `{ amount, id, isGridSummary: true }` inside `response.data`. When the summary row is
 * missing or unreadable, falls back to the loaded lines (the detail loads up to 100).
 *
 * @param {Function} apiFetch - from `useApiFetch(apiBaseUrl)` (base = the spec URL)
 * @param {string} remittanceId
 * @param {object[]} loadedLines - the lines DetailView already holds
 * @returns {Promise<{ total: number, count: number }>}
 */
export async function fetchLinesTotal(apiFetch, remittanceId, loadedLines = []) {
  const fallback = () => ({
    total: loadedLines.reduce((acc, l) => acc + (Number(l?.amount) || 0), 0),
    count: loadedLines.length,
  });
  try {
    const summary = encodeURIComponent(JSON.stringify({ amount: 'sum', id: 'count' }));
    const res = await apiFetch(`/lines?parentId=${encodeURIComponent(remittanceId)}&_summary=${summary}`);
    if (!res.ok) return fallback();
    const row = unwrapSummaryRow(await res.json());
    const total = Number(row?.amount);
    const count = Number(row?.id);
    if (!Number.isFinite(total) || !Number.isFinite(count)) return fallback();
    return { total, count };
  } catch {
    return fallback();
  }
}

function unwrapSummaryRow(json) {
  const data = json?.response?.data ?? json?.data;
  return Array.isArray(data) ? data[0] : data;
}

/**
 * ETP-6148 round 3 — applies the picker's changes in one transaction (RemittanceHeaderHandler
 * `syncDueItems`): `items` are the new dues and the included ones whose amount changed
 * (`{ id, amount }`, id = the FIN_Payment_Schedule id); `remove` the included dues the user
 * unchecked. Removal is explicit because the picker is paged and searchable: a due never loaded
 * is never touched. Refusals (422): ETGO_RemittanceLineAmountInvalid, ETGO_RemittanceDueItemNotAvailable,
 * ETGO_RemittanceDueItemNotIncluded (each with `invalidIds`), ETGO_RemittanceDueItemsSelectionFailed,
 * ETGO_RemittanceProcessedNotEditable — nothing is kept on any of them.
 *
 * @returns {Promise<{ created: number, updated: number, removed: number, message: string|null }>}
 * @throws {Error} with `body` when the backend refuses
 */
export async function syncDueItems(apiFetch, remittanceId, { items = [], remove = [] } = {}) {
  const res = await apiFetch(actionPath(remittanceId, 'syncDueItems'), {
    method: 'POST',
    body: JSON.stringify({ items, remove }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`syncDueItems ${res.status}`), { status: res.status, body: await readJsonSafely(res) });
  }
  const data = unwrap(await res.json());
  const count = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return {
    created: count(data.created),
    updated: count(data.updated),
    removed: count(data.removed),
    message: data.message ?? null,
  };
}
