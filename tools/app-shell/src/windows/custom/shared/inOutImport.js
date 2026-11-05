import { listAll, listLines } from './importActionClient.js';

/**
 * The data side of the four «Importar desde…» popups of a goods shipment / goods receipt
 * (from a sales / purchase ORDER, from a sales / purchase INVOICE) — ETP-6099.
 *
 * Every popup lists through the TARGET document's declared read actions, the same ones the MCP
 * `etendo_action` calls: `availableOrders` / `availableOrderLines` and `availableInvoices` /
 * `availableInvoiceLines` on `/{spec}/{goodsShipment|goodsReceipt}/{id}/action/<name>`. The server
 * applies the partner, direction, status and currency filter and computes the pending quantity
 * (drafts of the same direction deducted, this document included), so the popup no longer reads
 * the company-wide document list, every draft shipment and its lines, or the target header.
 *
 * Both reads ask `detail: true` (the extra row keys: an order's `amount`, a line's prices, ordered /
 * delivered quantities and `inDraftDocuments`; MCP answers without it stay as they were) and
 * `includeCovered: true`: documents with nothing left come at `pendingLines: 0`
 * (the popup hides them with `isDocumentCovered`, and still tells «all imported» apart from «no
 * documents»), lines with nothing left come at `pendingQuantity: 0` (greyed out).
 *
 * Pure functions over an injected `apiFetch`; a refused read rejects with `ImportLoadError`
 * (`importActionClient.js`), which the popup turns into a toast (`useImportLoadFailureToast`).
 */

const rowsOf = async (res) => (await res.json())?.response?.data || [];

/** A listed document the popup hides as fully imported (stable: an ImportLinesModal filter dep). */
export const isCoveredDocument = (doc) => Number(doc?.pendingLines) === 0;

/**
 * The row total of a listed ORDER: the server's pending amount (`amount`, sent with `detail`),
 * else the loaded lines' sum.
 */
export const pendingDocumentTotal = (doc) => {
  const amount = Number(doc?.amount);
  return doc?.amount != null && Number.isFinite(amount) ? amount : null;
};

/**
 * The row total of a listed INVOICE: always 0, as the popups showed it before ETP-6099 (their
 * lines carry no price, so the eager line sum was 0 on every listed invoice). `availableInvoices`
 * has no `amount`; without this the row would stay blank until expanded.
 */
export const zeroDocumentTotal = () => 0;

/** The line's selectable quantity: the server's pending, never negative. */
export const pendingOf = (row) => Math.max(0, Number(row?.pendingQuantity) || 0);

/**
 * The «in draft shipment: …» note of a line: the documentNo of the OTHER draft shipments /
 * receipts holding it, or undefined when none (the popup then says «already imported»).
 */
export const draftDocumentsOf = (row) =>
  (Array.isArray(row?.inDraftDocuments) && row.inDraftDocuments.length > 0 ? [...row.inDraftDocuments] : undefined);

/**
 * When the action lists nothing, whether that is because every candidate of the partner is in
 * another currency than the target (the popup's «no documents in this currency» message). The
 * server filters by currency silently, so only on an EMPTY list are the target header and the
 * partner's completed source documents read (server-filtered by partner and status) and compared
 * — two requests in the empty case, none otherwise. Any failure reads as «not by currency».
 *
 * @param {object} probe
 * @param {string} probe.sourceHeader  e.g. 'sales-order/header'
 * @param {Array<object>} [probe.criteria]  extra server criteria (e.g. plain invoices only)
 * @param {(doc: object) => boolean} [probe.isCandidate]  the popup's own candidate rule
 */
async function excludedOnlyByCurrency({ apiFetch, base, spec, entity, targetId, bpId, probe }) {
  if (!probe || !bpId) return false;
  const criteria = encodeURIComponent(JSON.stringify([
    { fieldName: 'businessPartner', operator: 'equals', value: bpId },
    { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
    ...(probe.criteria || []),
  ]));
  try {
    const [headerRes, sourceRes] = await Promise.all([
      apiFetch(`${base}/${spec}/${entity}/${targetId}`),
      apiFetch(`${base}/${probe.sourceHeader}?criteria=${criteria}&_startRow=0&_endRow=500&_sortBy=creationDate desc`),
    ]);
    if (!headerRes.ok || !sourceRes.ok) return false;
    const currency = (await rowsOf(headerRes))[0]?.etgoCurrency || null;
    if (!currency) return false;
    const isCandidate = probe.isCandidate || (() => true);
    const candidates = (await rowsOf(sourceRes)).filter(d =>
      d.documentStatus === 'CO' && d.businessPartner === bpId && isCandidate(d));
    return candidates.length > 0 && !candidates.some(d => d.currency === currency);
  } catch {
    return false;
  }
}

/**
 * The documents of a LIST action, covered ones included, each with its date copied under the
 * key the popup's `getDocDisplay` reads (`orderDate` / `invoiceDate`). `order` re-sorts them when
 * the popup listed in another order than the action (e.g. `newestCreatedFirst` from importActionClient.js). `entity` is the target's header entity
 * in the NEO path (`goodsShipment` / `goodsReceipt`), named by the popup.
 *
 * @returns {Promise<{ documents: object[], sharedContext: { targetId: string }, excludedByCurrency: boolean }>}
 */
export async function fetchInOutDocuments({
  apiFetch, base, spec, entity, targetId, bpId, action, dateKey, currencyProbe, order = (rows) => rows,
}) {
  const rows = await listAll({
    apiFetch, base, spec, targetId, action, entity, params: { includeCovered: true, detail: true },
  });
  const documents = order(rows.map(r => ({ ...r, [dateKey]: r.date, documentStatus: 'CO' })));
  const excludedByCurrency = documents.length === 0
    ? await excludedOnlyByCurrency({ apiFetch, base, spec, entity, targetId, bpId, probe: currencyProbe })
    : false;
  return { documents, sharedContext: { targetId }, excludedByCurrency };
}

/**
 * The rows of a LINE action for one source document (`params` carries `orderId` / `invoiceId`),
 * lines with nothing left included at `pendingQuantity: 0`, in `lineNo` order. `entity` as in
 * `fetchInOutDocuments`.
 */
export function fetchInOutLines({ apiFetch, base, spec, entity, targetId, action, params }) {
  if (!targetId) return Promise.resolve([]);
  return listLines({
    apiFetch, base, spec, targetId, action, entity, params: { ...params, includeCovered: true, detail: true },
  });
}
