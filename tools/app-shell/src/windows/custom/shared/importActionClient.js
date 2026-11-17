import { translateImportRefusal } from '../../../lib/backendErrors.js';

/**
 * The data side every «Importar desde…» popup shares to read its candidates from the TARGET
 * document's declared actions (`available*` / `available*Lines`, com.etendoerp.go) — the same
 * actions the MCP `etendo_action` tool calls, so the window and the agents list by one rule.
 * Extracted from `invoiceOrderImport.js` (ETP-5828) in ETP-6099.
 *
 * Pure functions over an injected `apiFetch` (docs/request-policy.md): a component hands in its
 * `useApiFetch('')`, a plain `node --test` a stub. Every read here:
 *  - is a POST with a JSON body and `refreshVersion: false` — it never changes the target, so the
 *    post-action re-read of the record (ETP-5434) is skipped;
 *  - rejects with `ImportLoadError` (carrying the response body) when the server refuses, so the
 *    popup can tell the user (`describeLoadFailure`) instead of showing «nothing to import».
 *    A request with no HTTP answer rejects with apiFetch's own (already translated) NetworkError.
 */

/**
 * `${base}/${spec}/${entity}/${targetId}/action/${action}`. `entity` is the target's header
 * entity in the NEO path: `header` on invoices and orders (the default); the in-out callers pass
 * their own (`goodsShipment` / `goodsReceipt`). The caller names it: this shared client carries no
 * per-spec map.
 */
export const actionUrl = (base, spec, targetId, action, entity = 'header') =>
  `${base}/${spec}/${entity}/${targetId}/action/${action}`;

/**
 * ETP-6099 — `rows` newest CREATED first (`creationDate` desc), the order the popups listed in
 * when they read the header GET (`_sortBy=creationDate desc`); the list actions answer newest by
 * document date, and a row carries `creationDate` under `detail: true`. Stable: equal or missing
 * timestamps keep the server order, and without any `creationDate` the same array is returned.
 * `creationDate` is a full timestamp, so instants are compared (no calendar-day parsing).
 */
export function newestCreatedFirst(rows) {
  if (!rows.some(r => r?.creationDate)) return rows;
  const at = (r) => {
    const t = Date.parse(r?.creationDate);
    return Number.isFinite(t) ? t : -Infinity;
  };
  return rows
    .map((row, index) => ({ row, index, t: at(row) }))
    .sort((a, b) => (b.t - a.t) || (a.index - b.index))
    .map(({ row }) => row);
}

/** The longest page a list action serves (`limit` 1..1000). */
export const MAX_ACTION_PAGE = 1000;

/** Fetch options of a read action: POST, JSON body, no record re-read. */
export const readAction = (body) => ({ method: 'POST', body: JSON.stringify(body), refreshVersion: false });

/**
 * A failed candidate read is NOT "nothing to import": it rejects with this error, `body` being
 * the server's JSON answer (or null), and the popup shows `describeLoadFailure(err, ui)`.
 */
export class ImportLoadError extends Error {
  constructor(body) {
    super('importLoadFailed');
    this.name = 'ImportLoadError';
    this.body = body;
  }
}

/** The `ImportLoadError` of a non-ok response. */
export async function loadFailure(res) {
  return new ImportLoadError(await res.json().catch(() => null));
}

const responseOf = async (res) => (await res.json())?.response || {};

/**
 * One read-action call; resolves to the action's `response` (`{ data, hasMore, nextOffset, … }`),
 * rejects with `ImportLoadError` on a refusal.
 */
export async function callReadAction({ apiFetch, base, spec, targetId, action, body = {}, entity }) {
  const res = await apiFetch(actionUrl(base, spec, targetId, action, entity), readAction(body));
  if (!res.ok) throw await loadFailure(res);
  return responseOf(res);
}

/**
 * Every row of a LIST action (`availableOrders`, `availableShipments`, `availableReceipts`,
 * `availableReturns`, `availableOriginInvoices`, `availableInvoices`). Asks `limit: 1000` (plus
 * `params`, e.g. `{ includeCovered: true }`) and, while the answer says `hasMore`, asks again from
 * `nextOffset` — the contract's completeness guarantee: when it resolves, every candidate of the
 * partner was examined. The first call sends no `offset` (the server's default 0).
 */
export async function listAll({ apiFetch, base, spec, targetId, action, params = {}, entity }) {
  const rows = [];
  let offset = null;
  for (;;) {
    const body = { limit: MAX_ACTION_PAGE, ...params, ...(offset != null ? { offset } : {}) };
    const page = await callReadAction({ apiFetch, base, spec, targetId, action, body, entity });
    rows.push(...(page.data || []));
    const next = Number(page.nextOffset);
    // Stop on the last page, and on an answer that would not move forward (never loop forever).
    if (!page.hasMore || !Number.isInteger(next) || next <= (offset ?? 0)) return rows;
    offset = next;
  }
}

/**
 * The rows of a LINE action (`availableOrderLines`, `availableShipmentLines`, …) for one source
 * document, in `lineNo` order. `params` carries the source id under the action's own key
 * (`orderId`, `shipmentId`, `receiptId`, `returnId`, `invoiceId`) and, usually,
 * `includeCovered: true` so lines with nothing left come at `pendingQuantity: 0` for the popup to
 * grey out.
 */
export async function listLines({ apiFetch, base, spec, targetId, action, params = {}, entity }) {
  const page = await callReadAction({ apiFetch, base, spec, targetId, action, body: params, entity });
  return [...(page.data || [])].sort((a, b) => (Number(a.lineNo) || 0) - (Number(b.lineNo) || 0));
}

/**
 * The sentence for a failed candidate read: the server's refusal by its code when it has one, a
 * request that got no answer by its own (already translated) message, otherwise the generic
 * «No se pudieron cargar los documentos».
 */
export function describeLoadFailure(err, ui) {
  const fallback = ui('documentsLoadError');
  if (err instanceof ImportLoadError) return translateImportRefusal(err.body, ui, fallback);
  return err?.message || fallback;
}

/**
 * The refusal of an IMPORT action (a non-ok response) in the user's language: its code
 * (`importQuantityExceedsPending`, `globalDiscountConflict`, …) rendered by
 * `translateImportRefusal`, never the server's English prose; anything it cannot render becomes
 * `ui(fallbackKey)` («Failed to import lines» by default).
 */
export async function actionErrorMessage(res, ui, fallbackKey = 'failedToImportLines') {
  const fallback = ui(fallbackKey);
  try {
    return translateImportRefusal(await res.json(), ui, fallback);
  } catch {
    return fallback;
  }
}
