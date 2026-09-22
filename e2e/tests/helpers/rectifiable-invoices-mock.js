/**
 * ETP-5381 — mock of the `rectifiableInvoices` action, faithful to the server contract.
 *
 * Search and paging moved SERVER-SIDE: `InvoicePickerModal` runs in its controlled mode for the
 * return flow (`onSearchChange` supplied), renders the batch it is handed verbatim and never
 * filters locally. That is deliberate — over a single batch a local filter would answer
 * "no matches" for an invoice the server has but has not sent yet, which is the exact bug the
 * redesign exists to prevent. A mock that ignores the request body therefore silently breaks the
 * only thing the search assertions are trying to prove.
 *
 * Shared by return-material-receipt.mocked.spec.js and return-to-vendor-shipment.mocked.spec.js so
 * the two never drift into modelling the same endpoint differently.
 *
 * Request body (POST, NOT a query string — an action endpoint does not populate queryParams;
 * see ReturnShipmentUtils#buildRectifiableInvoicesResponse):
 *   { startRow: 0, pageSize: 80, search: 'FC-…' }
 * Response:
 *   { response: { data: { invoices, hasMore, startRow, hasReturnInvoice, suggestedInvoiceIds } } }
 */

/** Mirrors ReturnShipmentUtils.DEFAULT_RECTIFIABLE_PAGE_SIZE / RECTIFIABLE_PAGE_SIZE. */
export const RECTIFIABLE_PAGE_SIZE = 80;

/**
 * Mirrors the SQL filter exactly:
 *   LOWER(i.DocumentNo) LIKE %q% OR LOWER(COALESCE(bp.Name,'')) LIKE %q%
 * Note the partner NAME lives in `businessPartner` on these rows — they come from a hand-built
 * projection, not the entity serializer, so there is no `businessPartner$_identifier`.
 */
function matchesSearch(inv, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return `${inv.documentNo || ''}`.toLowerCase().includes(needle)
    || `${inv.businessPartner || ''}`.toLowerCase().includes(needle);
}

/**
 * Builds the action payload for one request.
 *
 * @param {object}   opts
 * @param {object[]} opts.invoices            the full candidate set this fixture models
 * @param {string[]} opts.suggestedInvoiceIds ids the backend auto-detected from the return chain
 * @param {object}   opts.body                the parsed POST body ({} when absent)
 */
export function buildRectifiableInvoicesPayload({ invoices, suggestedInvoiceIds = [], body = {} }) {
  const startRow = Number.isFinite(body.startRow) ? Math.max(0, body.startRow) : 0;
  const pageSize = Number.isFinite(body.pageSize) ? body.pageSize : RECTIFIABLE_PAGE_SIZE;
  const search = typeof body.search === 'string' ? body.search : null;
  const firstBatch = startRow <= 0;

  // The selectable window: narrowed by the search, then sliced by the requested page.
  const matched = invoices.filter(inv => matchesSearch(inv, search));
  const selectable = matched.slice(startRow, startRow + pageSize);
  const selectableIds = new Set(selectable.map(inv => inv.id));

  // A full batch means "there may be more"; a short one is the end of the set. Same signal
  // useEntity reads, so the client needs no total count.
  const hasMore = selectable.length >= pageSize;

  // Chain detection is NOT narrowed by the search, and only runs on the first batch. A detected
  // invoice outside the current window is prepended anyway — otherwise its id ships in
  // suggestedInvoiceIds, the client drops it for having no matching row, and the user sees an
  // empty preselection with no way to reach it.
  const detected = firstBatch
    ? invoices.filter(inv => suggestedInvoiceIds.includes(inv.id))
    : [];
  const detectedIds = new Set(detected.map(inv => inv.id));

  const rows = [
    ...detected.filter(inv => !selectableIds.has(inv.id)).map(inv => ({ ...inv, suggested: true })),
    ...selectable.map(inv => ({ ...inv, suggested: detectedIds.has(inv.id) })),
  ];

  return {
    invoices: rows,
    hasMore,
    startRow,
    hasReturnInvoice: false,
    // Always the full detected set, on every batch — the client never depends on batch order.
    suggestedInvoiceIds: invoices
      .filter(inv => suggestedInvoiceIds.includes(inv.id))
      .map(inv => inv.id),
  };
}
