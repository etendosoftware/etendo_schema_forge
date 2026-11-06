// ETP-6148 — «Seleccionar desde factura»: the two remittance-header actions behind the due-item
// picker, served by RemittanceHeaderHandler (com.etendoerp.go). Pure functions over an injected
// `apiFetch` (the shared helper from `useApiFetch(apiBaseUrl)`), so the modal stays thin and these
// can be unit-tested without React.
//
// Contract (NEO action envelope `{ response: { data } }`, read defensively):
//   POST /remittance/{id}/action/availableDueItems  { search, page, pageSize }
//     → { items: [{ id, documentNo, businessPartner, dueDate, outstandingAmount, currency,
//                   alreadyInRemittance }], total }
//   POST /remittance/{id}/action/selectDueItems     { ids }
//     → { created, message }    errors: 422 with `messageKeys`

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
 * Adds the chosen due items to the remittance as lines.
 *
 * @returns {Promise<{ created: number, message: string|null }>}
 * @throws {Error} with `body` when the backend refuses
 */
export async function selectDueItems(apiFetch, remittanceId, ids) {
  const res = await apiFetch(actionPath(remittanceId, 'selectDueItems'), {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`selectDueItems ${res.status}`), { status: res.status, body: await readJsonSafely(res) });
  }
  const data = unwrap(await res.json());
  const created = Number.isFinite(Number(data.created)) ? Number(data.created) : ids.length;
  return { created, message: data.message ?? null };
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
