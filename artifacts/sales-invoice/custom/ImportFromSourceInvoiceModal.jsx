import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import { listAll, listLines } from '@/windows/custom/shared/importActionClient.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { newestCreatedFirst } from '@/windows/custom/shared/invoiceOrderImport.js';

/**
 * Import invoice lines from a completed, plain "Factura" (FAC subtype) sales
 * invoice belonging to the same customer, for use on a Factura Rectificativa
 * (RECTIFICATIVA subtype). ETP-4737.
 *
 * Unlike ImportFromShipmentModal/ImportFromReturnShipmentModal, the source
 * document here is another C_InvoiceLine record — same table, same field
 * shape as the target — so no callout-based price resolution is needed: the
 * source line's already-resolved unitPrice/listPrice/etgoDiscount/tax/uOM are
 * carried over directly, same as ImportFromOrderModal does for order lines.
 *
 * Source filtering: per the ticket's acceptance criteria ("el filtro
 * Importar desde Factura origen muestra solo facturas de Tipo Factura"),
 * candidates are the customer's completed, NON-rectificative invoices in the
 * invoice's currency — since ETP-6099 decided by the `availableOriginInvoices`
 * action (the same rule the MCP gets). The «other currency» fallback below
 * still uses the ARI-category / not-rectificative list criteria, the same as
 * the merged "Facturas" subset filter in decisions.json (`invoicesTab`).
 *
 * Sign convention (ETP-4737, resolved with product/Vale): importing from a
 * source invoice models reversing/correcting it, so lines are ALWAYS
 * imported with a negative quantity regardless of the source line's own
 * sign — mirrors purchase-invoice's ImportFromSourceInvoiceModal. The picker
 * shows the quantity stepper itself as negative (via ImportLinesModal's
 * negativeQuantity prop) rather than a positive magnitude with a hidden sign
 * flip, so what the user sees matches what gets persisted. There is no +/-
 * choice in the popup by design — if a positive correction is intended, the
 * user edits the line by hand after import.
 *
 * Origin link (ETP-6002): this modal no longer PATCHes the header. Each line
 * POST carries `sourceInvoiceLineId`, and the backend (`SalesInvoiceLineHandler`
 * → `SalesRectificativeLineLinkSupport`) writes the `C_Invoice_Reverse` row to
 * that line's invoice in the same transaction as the line, deduplicated, so the
 * rectificativa ends up linked to EVERY source invoice it was imported from
 * (ETP-4919). The old header PATCH always failed with 409 `stale_record`
 * (creating the lines moves the header's `updated`) and its result was ignored.
 * Surfaced back on GET via `enrichOriginInvoice`/`originInvoices`.
 * purchase-invoice still links through its header PATCH.
 *
 * Duplicate detection: each imported line carries `sourceInvoiceLineId` (the source
 * C_InvoiceLine id) in its POST body, persisted by `InvoiceLineHandler#persistSourceInvoiceLine`
 * into `EM_ETGO_Source_Invoiceline_ID` — a self-referencing FK on C_InvoiceLine (same
 * pattern as `BOM_Parent_ID`). Surfaced back on GET as the same key
 * (`enrichSourceInvoiceLineId`). Since ETP-6099 the server reads that link: an
 * `availableOriginInvoiceLines` row says `importedHere`, and `fetchLines` marks it
 * `_alreadyImported`, blocking re-selection.
 */

const SPEC = 'sales-invoice';

/**
 * ETP-6099 (speed): the candidates come from THIS invoice's `availableOriginInvoices` action
 * (com.etendoerp.go `ImportOriginInvoiceLinesHandler`, the one the MCP calls): the customer's
 * completed, non-rectificative invoices in the invoice's currency, newest created first (re-sorted
 * by the row's `creationDate`, the action answers by invoice date), every page read. `detail` adds
 * the row `amount` (the doc total), and `includeCovered` also brings the ones whose lines are all
 * imported here (pendingLines 0), which the row hides as it did when it read every invoice and
 * their lines. It replaced the company-wide 500-invoice GET, this invoice's lines GET and its
 * header GET.
 */
const fetchDocuments = async ({ base, bpId, invoiceId }) => {
  const rows = await listAll({
    apiFetch: moduleApiFetch, base, spec: SPEC, targetId: invoiceId,
    action: 'availableOriginInvoices', params: { includeCovered: true, detail: true },
  }).then(newestCreatedFirst);
  const documents = rows.map(r => ({ ...r, invoiceDate: r.date, documentStatus: 'CO' }));
  const excludedByCurrency = documents.length === 0
    && await onlyOtherCurrencies({ base, bpId, invoiceId });
  return { documents, sharedContext: { invoiceId }, excludedByCurrency };
};

/**
 * Only when the action lists nothing: does the customer have plain (FAC) completed invoices in
 * ANOTHER currency? That keeps the «no invoices in this currency» message apart from «no
 * invoices». The invoice's currency is read here only, and a failed read just says no.
 */
const onlyOtherCurrencies = async ({ base, bpId, invoiceId }) => {
  const criteria = encodeURIComponent(JSON.stringify([
    { fieldName: 'transactionDocument$documentCategory', operator: 'equals', value: 'ARI' },
    { fieldName: 'transactionDocument$etsgIsRectificative', operator: 'notEqual', value: true },
    { fieldName: 'businessPartner', operator: 'equals', value: bpId },
    { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
  ]));
  try {
    const [invRes, headerRes] = await Promise.all([
      moduleApiFetch(`${base}/${SPEC}/header?_startRow=0&_endRow=500&_sortBy=creationDate desc&criteria=${criteria}`),
      moduleApiFetch(`${base}/${SPEC}/header/${invoiceId}`),
    ]);
    if (!invRes.ok || !headerRes.ok) return false;
    const invoiceCurrency = (await headerRes.json())?.response?.data?.[0]?.currency || null;
    if (!invoiceCurrency) return false;
    const candidates = (await invRes.json())?.response?.data || [];
    return candidates.some(inv => inv.id !== invoiceId && inv.currency !== invoiceCurrency);
  } catch {
    return false;
  }
};

/**
 * One `availableOriginInvoiceLines` call per source invoice; `detail` adds the price, quantity
 * and `importedHere` keys the popup reads. `includeCovered` brings the lines
 * already imported here at pendingQuantity 0 with `importedHere`; they are shown (greyed) with the
 * source line's own quantity, as before. The row carries the prices, discount, tax and UoM
 * `buildLineBody` copies, so no source-lines GET is needed.
 */
const fetchLines = async ({ base, docId, sharedContext }) => {
  const invoiceId = sharedContext?.invoiceId;
  if (!invoiceId) return [];
  const lines = await listLines({
    apiFetch: moduleApiFetch, base, spec: SPEC, targetId: invoiceId,
    action: 'availableOriginInvoiceLines', params: { invoiceId: docId, includeCovered: true, detail: true },
  });
  return lines.map(l => {
    const qty = Number(l.invoicedQuantity) || 0;
    const unitPrice = Number(l.unitPrice) || 0;
    const imported = !!l.importedHere;
    return {
      ...l,
      etgoDiscount: l.discount ?? l.etgoDiscount,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: imported ? Math.abs(qty) : (Number(l.pendingQuantity) || 0),
      _unitPrice: unitPrice,
      _lineNetAmount: Number(l.lineNetAmount) || (unitPrice * qty),
      _alreadyImported: imported,
    };
  });
};

const getDocDisplay = (doc) => ({
  docNo: doc.documentNo || doc.id,
  date: doc.invoiceDate,
});

// ETP-6099 — the lines are read only when an invoice is opened (`eagerLoadLines` off), so the row
// decides from the `availableOriginInvoices` row: an invoice with nothing left to import is hidden,
// and the row total is its `amount` (unit price × |quantity| over all its lines, the ones already
// imported here included, as the loaded lines added up), negated like the quantities shown.
// Without an `amount` (older backend) the modal sums the loaded lines.
const isDocumentCovered = (doc) => doc.pendingLines != null && Number(doc.pendingLines) === 0;
const getDocumentTotal = (doc) => (doc.amount == null ? null : -Math.abs(Number(doc.amount)));

const buildLineBody = async ({ line, qty, invoiceId, lineNo }) => {
  const unitPrice = Number(line.unitPrice) || 0;
  const listPrice = Number(line.listPrice) || unitPrice;
  const grossUnitPrice = Number(line.grossUnitPrice) || 0;
  const discount = Number(line.etgoDiscount) || 0;
  // Always negative regardless of the source line's own sign (see the
  // sign-convention note above) — the quantity input yields a positive
  // magnitude, so negate it here.
  const negQty = -Math.abs(qty);
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: negQty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    ...(discount ? { etgoDiscount: discount } : {}),
    lineNetAmount: unitPrice * negQty,
    tax: line.tax || null,
    uOM: line.uOM || null,
    lineNo,
    // ETP-6002 (as ETP-5729 for the return path): NO salesOrderLine. The source line's order line
    // is where the SOURCE invoice came from, not this rectificative. On the negative line,
    // C_INVOICE_POST would subtract it from C_OrderLine.QtyInvoiced (the returned quantity turns
    // invoiceable again) and match the rectificative to the order's shipment (M_MatchSI), a
    // transitive relation. The rectificative is tied to the invoice it rectifies by
    // C_Invoice_Reverse, through sourceInvoiceLineId. The server also drops it on every channel
    // (SalesRectificativeLineLinkSupport#dropOrderLineOnRectificativeCopy).
    sourceInvoiceLineId: line.id,
  };
};

// No afterImport: the rectificative's C_Invoice_Reverse link to the source invoice is written by
// the backend when each line is created with sourceInvoiceLineId (ETP-6002,
// SalesRectificativeLineLinkSupport in com.etendoerp.go). The header PATCH that used to do it
// carried the `updated` token read before the import; creating the lines recalculates the header
// totals, so it always came back 409 stale_record and the link was never written.

export default function ImportFromSourceInvoiceModal(props) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: these modals pull from ANOTHER spec than their own window
  // (an invoice importing shipment lines), and resolveApiUrl only skips a prefix that
  // matches - so a configured base doubles it and 404s.
  const apiFetch = useApiFetch('');
  // ETP-6099 — a refused read is told (describeLoadFailure toast) and the list shows what an empty
  // answer shows, like the order import.
  const handlers = useImportLoadFailureToast(fetchDocuments, fetchLines);
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="sales-invoice/lines"
      titleKey="importFromSourceInvoice"
      searchPlaceholderKey="searchSourceInvoice"
      emptyMessageKey="noSourceInvoicesForCustomer"
      noSearchResultsKey="noSourceInvoicesMatchSearch"
      noCurrencyMatchMessageKey="noSourceInvoicesMatchCurrency"
      successMessageKey="linesImportedFromSourceInvoice"
      negativeQuantity
      fetchDocuments={handlers.fetchDocuments}
      fetchLines={handlers.fetchLines}
      getDocDisplay={getDocDisplay}
      eagerLoadLines={false}
      isDocumentCovered={isDocumentCovered}
      getDocumentTotal={getDocumentTotal}
      buildLineBody={buildLineBody}
    />
  );
}
