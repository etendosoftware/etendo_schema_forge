import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';

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
 * candidates are restricted server-side to the plain-invoice ARI category
 * AND excluded from the rectificative flag — the exact same criteria used
 * for the merged "Facturas" subset filter in decisions.json (see the
 * `invoicesTab` entry's `_note` for the full discriminator rationale). This
 * is a real backend list-query filter (not the GET-by-ID-only
 * `arInvoiceSubtype` enrichment), so it is safe to apply here too.
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
 * (`enrichSourceInvoiceLineId`), so `fetchDocuments` can build the already-imported set and
 * `fetchLines` marks matching source lines `_alreadyImported`, blocking re-selection.
 */

const fetchDocuments = async ({ base, bpId, invoiceId }) => {
  const facOnlyCriteria = encodeURIComponent(JSON.stringify([
    { fieldName: 'transactionDocument$documentCategory', operator: 'equals', value: 'ARI' },
    { fieldName: 'transactionDocument$etsgIsRectificative', operator: 'notEqual', value: true },
  ]));
  const [invRes, invLinesRes, headerRes] = await Promise.all([
    moduleApiFetch(`${base}/sales-invoice/header?_startRow=0&_endRow=500&_sortBy=creationDate desc&criteria=${facOnlyCriteria}`),
    moduleApiFetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`),
    moduleApiFetch(`${base}/sales-invoice/header/${invoiceId}`),
  ]);

  const alreadyImportedSourceLineIds = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.sourceInvoiceLineId) alreadyImportedSourceLineIds.add(il.sourceInvoiceLineId); });
  }

  let invoiceCurrency = null;
  if (headerRes.ok) {
    invoiceCurrency = (await headerRes.json())?.response?.data?.[0]?.currency || null;
  }

  let documents = [];
  let excludedByCurrency = false;
  if (invRes.ok) {
    const all = (await invRes.json())?.response?.data || [];
    const candidates = all.filter(inv =>
      inv.documentStatus === 'CO'
      && inv.businessPartner === bpId
      && inv.id !== invoiceId,
    );
    documents = invoiceCurrency ? candidates.filter(inv => inv.currency === invoiceCurrency) : candidates;
    excludedByCurrency = !!invoiceCurrency && documents.length === 0 && candidates.length > 0;
  }
  return { documents, sharedContext: { alreadyImportedSourceLineIds }, excludedByCurrency };
};

const fetchLines = async ({ base, docId, sharedContext }) => {
  const res = await moduleApiFetch(`${base}/sales-invoice/lines?parentId=${docId}&_startRow=0&_endRow=200`);
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  const { alreadyImportedSourceLineIds } = sharedContext;
  return lines.map(l => {
    const qty = Number(l.invoicedQuantity) || 0;
    const unitPrice = Number(l.unitPrice) || 0;
    return {
      ...l,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: Math.abs(qty),
      _unitPrice: unitPrice,
      _lineNetAmount: Number(l.lineNetAmount) || (unitPrice * qty),
      _alreadyImported: !!alreadyImportedSourceLineIds?.has(l.id),
    };
  });
};

const getDocDisplay = (doc) => ({
  docNo: doc.documentNo || doc.id,
  date: doc.invoiceDate,
});

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
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
