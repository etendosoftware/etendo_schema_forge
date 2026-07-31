import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';

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
 * Sign convention: the new "Factura Rectificativa" doc type is modeled as a
 * plain invoice variant (Return=No, Credit Memo=No at the AD level), not a
 * structural credit-memo/return type — so, unlike
 * ImportFromReturnShipmentModal, imported lines are NOT force-negated. The
 * source line's own sign is preserved; the user can edit quantity/price
 * inline afterward if a reduction is intended.
 *
 * Duplicate detection: there is no natural FK from a rectificativa line back
 * to its source invoice line (invoice-to-invoice import is new — no schema
 * column for it), so only the existing cOrderlineId-based check (shared with
 * the shipment/order modals, when the source line itself traces back to an
 * order) is reused as a best-effort safety net. Re-importing the same source
 * invoice twice is not blocked.
 */

const fetchDocuments = async ({ base, headers, bpId, invoiceId }) => {
  const facOnlyCriteria = encodeURIComponent(JSON.stringify([
    { fieldName: 'transactionDocument$documentCategory', operator: 'equals', value: 'ARI' },
    { fieldName: 'transactionDocument$etsgIsRectificative', operator: 'notEqual', value: true },
  ]));
  const [invRes, invLinesRes, headerRes] = await Promise.all([
    fetch(`${base}/sales-invoice/header?_startRow=0&_endRow=500&_sortBy=creationDate desc&criteria=${facOnlyCriteria}`, { headers }),
    fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/sales-invoice/header/${invoiceId}`, { headers }),
  ]);

  const alreadyImportedOrderLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.cOrderlineId) alreadyImportedOrderLines.add(il.cOrderlineId); });
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
  return { documents, sharedContext: { alreadyImportedOrderLines }, excludedByCurrency };
};

const fetchLines = async ({ base, headers, docId, sharedContext }) => {
  const res = await fetch(`${base}/sales-invoice/lines?parentId=${docId}&_startRow=0&_endRow=200`, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  const { alreadyImportedOrderLines } = sharedContext;
  return lines.map(l => {
    const qty = Number(l.invoicedQuantity) || 0;
    const unitPrice = Number(l.unitPrice) || 0;
    const alreadyInCurrent = !!(l.cOrderlineId && alreadyImportedOrderLines?.has(l.cOrderlineId));
    return {
      ...l,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: Math.abs(qty),
      _unitPrice: unitPrice,
      _lineNetAmount: Number(l.lineNetAmount) || (unitPrice * qty),
      _alreadyImported: alreadyInCurrent,
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
  // The quantity input always yields a positive magnitude — re-apply the
  // source line's own sign so a source line that was itself negative stays
  // negative on import (see sign-convention note above).
  const sourceQty = Number(line.invoicedQuantity) || 0;
  const signedQty = sourceQty < 0 ? -Math.abs(qty) : Math.abs(qty);
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: signedQty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    ...(discount ? { etgoDiscount: discount } : {}),
    lineNetAmount: unitPrice * signedQty,
    tax: line.tax || null,
    uOM: line.uOM || null,
    lineNo,
    cOrderlineId: line.cOrderlineId || null,
  };
};

export default function ImportFromSourceInvoiceModal(props) {
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
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
