import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';

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
 * After import, this modal PATCHes the header's `originInvoices` virtual
 * field (`AbstractInvoiceHeaderHandler#persistOriginInvoice`) with the FULL
 * set of ids imported in this run, so the rectificativa stays linked to
 * EVERY source invoice it was imported from — not just the last one
 * (ETP-4919: importing from a second source invoice used to silently drop
 * the link to the first, both because of the `size !== 1` guard removed
 * below and because the backend used to delete-then-single-create). Same
 * mechanism as purchase-invoice, surfaced back on GET via
 * `enrichOriginInvoice`/`originInvoices`.
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
    apiFetch(`${base}/sales-invoice/header?_startRow=0&_endRow=500&_sortBy=creationDate desc&criteria=${facOnlyCriteria}`),
    apiFetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`),
    apiFetch(`${base}/sales-invoice/header/${invoiceId}`),
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
  const res = await apiFetch(`${base}/sales-invoice/lines?parentId=${docId}&_startRow=0&_endRow=200`);
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
    cOrderlineId: line.cOrderlineId || null,
    sourceInvoiceLineId: line.id,
  };
};

const afterImport = async ({ importedDocIds, base, invoiceId }) => {
  // ETP-4919: importing from a second (or third...) source invoice must not lose the link to
  // the ones already imported — send the FULL set, not just guard on exactly one.
  if (importedDocIds.size === 0) return;
  try {
    await apiFetch(`${base}/sales-invoice/header/${invoiceId}`, {
      method: 'PATCH',
      
      body: JSON.stringify({ originInvoices: [...importedDocIds] }),
    });
  } catch {
    // best-effort — the lines are already imported regardless of this link.
  }
};

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
      afterImport={afterImport}
    />
  );
}
