import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { getApSubtype } from './purchaseInvoiceSubtype';

/**
 * Import invoice lines from a completed standard ("Factura") purchase invoice
 * for the same supplier — the manual counterpart to generating a rectificative
 * invoice from a Goods Return. Available only for RECTIFICATIVA-subtype
 * purchase invoices — enforced at the call site (see
 * PurchaseInvoiceBottomPanel.jsx).
 *
 * Per ETP-4737 acceptance criteria ("Importar desde Factura origen muestra
 * solo facturas de Tipo Factura"): the source-invoice picker is filtered to
 * `apInvoiceSubtype === 'FAC'` only — a rectificative invoice can never be
 * used to rectify another rectificative invoice. This filter is applied
 * client-side via `getApSubtype()` because `apInvoiceSubtype` is a virtual
 * field computed at GET-response time (PurchaseInvoiceHeaderHandler), not a
 * persisted/Hibernate-mapped property, so it cannot be expressed as backend
 * list criteria.
 *
 * Lines are copied with a NEGATIVE invoiced quantity by default (mirrors
 * ImportFromGoodsReturnModal) — importing from a source invoice models
 * reversing/correcting that invoice's amounts. The quantity stepper shows
 * this negative value directly (ImportLinesModal's `negativeQuantity` prop,
 * ETP-4737) rather than a positive magnitude with a hidden sign flip, so
 * what the user sees matches what gets persisted; there is no +/- choice in
 * the popup by design — a positive correction is made by hand after import.
 *
 * After import, this modal best-effort PATCHes the header's `originInvoices`
 * virtual field (`AbstractInvoiceHeaderHandler#persistOriginInvoice`,
 * com.etendoerp.go) with the FULL set of ids imported in this run, so the
 * rectificative invoice stays linked to EVERY source invoice it was imported
 * from — not just the last one (ETP-4919: importing from a second source
 * invoice used to silently drop the link to the first, both because of the
 * `size !== 1` guard removed below and because the backend used to
 * delete-then-single-create). Surfaced back on GET via
 * `enrichOriginInvoice`/`originInvoices`. This is independent of, and does
 * not touch, the separate "Reversed Invoices" / 349-boxes tab
 * (`ReversedInvoicesPanel.jsx`), which manages its own rows on the same
 * table for Modelo 349 reporting.
 *
 * Duplicate detection: each imported line carries `sourceInvoiceLineId` (the source
 * C_InvoiceLine id) in its POST body, persisted by `InvoiceLineHandler#persistSourceInvoiceLine`
 * into `EM_ETGO_Source_Invoiceline_ID` — a self-referencing FK on C_InvoiceLine (same
 * pattern as `BOM_Parent_ID`). Surfaced back on GET as the same key
 * (`enrichSourceInvoiceLineId`), so `fetchDocuments` can build the already-imported set and
 * `fetchLines` marks matching source lines `_alreadyImported`, blocking re-selection.
 */

const resolveLinePrice = async (base, headers, productId, qty, invoiceHeader, auxData = {}) => {
  const formState = {
    ...invoiceHeader,
    ...auxData,
    product: productId,
    invoicedQuantity: qty || 1,
  };
  try {
    const auxiliaryValues = {};
    for (const [k, v] of Object.entries(formState)) {
      if (/^[a-zA-Z]+_[A-Z]{2,5}$/.test(k) && v != null && v !== '') {
        auxiliaryValues[k] = String(v);
      }
    }
    const res = await fetch(`${base}/purchase-invoice/lines/callout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        field: 'product', value: productId, formState,
        ...(Object.keys(auxiliaryValues).length > 0 ? { auxiliaryValues } : {}),
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const result = {};
    if (data.updates) {
      for (const [k, entry] of Object.entries(data.updates)) result[k] = entry.value;
    }
    if (data.combos) {
      for (const [k, combo] of Object.entries(data.combos)) {
        if (combo.selected != null) result[k] = combo.selected;
      }
    }
    if (Number(result.standardPrice) && !Number(result.listPrice)) {
      result.listPrice = result.standardPrice;
    }
    const unitPrice = Number(result.unitPrice) || Number(result.grossUnitPrice) || 0;
    if (unitPrice) result.unitPrice = unitPrice;
    return result;
  } catch {
    return {};
  }
};

const fetchDocuments = async ({ base, headers, bpId, invoiceId }) => {
  const [res, invLinesRes] = await Promise.all([
    fetch(`${base}/purchase-invoice/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/purchase-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
  ]);

  let documents = [];
  if (res.ok) {
    const all = (await res.json())?.response?.data || [];
    documents = all.filter(inv =>
      inv.id !== invoiceId
      && inv.documentStatus === 'CO'
      && inv.businessPartner === bpId
      && getApSubtype(inv) === 'FAC'
    );
  }

  // ETP-4737: which source lines are already imported into THIS invoice, via the
  // EM_ETGO_Source_Invoiceline_ID link persisted by buildLineBody below and
  // surfaced on GET as sourceInvoiceLineId (InvoiceLineHandler#enrichSourceInvoiceLineId).
  const alreadyImportedSourceLineIds = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.sourceInvoiceLineId) alreadyImportedSourceLineIds.add(il.sourceInvoiceLineId); });
  }

  return {
    documents,
    sharedContext: { productAuxMap: {}, alreadyImportedSourceLineIds },
    excludedByCurrency: false,
  };
};

const fetchLines = async ({ base, headers, docId, sharedContext }) => {
  const res = await fetch(`${base}/purchase-invoice/lines?parentId=${docId}&_startRow=0&_endRow=200`, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  const alreadyImportedSourceLineIds = sharedContext?.alreadyImportedSourceLineIds;
  return lines.map(l => {
    const qty = Math.abs(Number(l.invoicedQuantity)) || 0;
    const unitPrice = Number(l.unitPrice) || 0;
    return {
      ...l,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: qty,
      _unitPrice: unitPrice,
      _lineNetAmount: unitPrice * qty,
      _tax: l.tax || null,
      _uOM: l.uOM || null,
      _alreadyImported: !!alreadyImportedSourceLineIds?.has(l.id),
    };
  });
};

const getDocDisplay = (doc) => ({
  docNo: doc.documentNo || doc.id,
  date: doc.invoiceDate,
});

const afterImport = async ({ importedDocIds, base, headers, invoiceId }) => {
  // ETP-4919: importing from a second (or third...) source invoice must not lose the link to
  // the ones already imported — send the FULL set, not just guard on exactly one.
  if (importedDocIds.size === 0) return;
  try {
    await fetch(`${base}/purchase-invoice/header/${invoiceId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ originInvoices: [...importedDocIds] }),
    });
  } catch {
    // best-effort — the lines are already imported regardless of this link.
  }
};

const buildLineBody = async ({ line, qty, invoiceId, lineNo, base, headers }) => {
  const priceData = await resolveLinePrice(base, headers, line.product, qty, {}, {});
  const calloutGrossUnitPrice = Number(priceData.grossUnitPrice) || 0;
  const calloutUnitPrice = Number(priceData.unitPrice) || calloutGrossUnitPrice || Number(line._unitPrice) || Number(line.unitPrice) || 0;
  const listPrice = Number(priceData.listPrice) || Number(line.listPrice) || calloutUnitPrice;
  const unitPrice = calloutUnitPrice || Number(line.unitPrice) || 0;
  const discount = Number(line.etgoDiscount) || 0;

  // Importing from a source invoice models reversing/correcting it — negative
  // quantity by default, same convention as ImportFromGoodsReturnModal.
  const negQty = -Math.abs(qty);
  const lineNetAmount = negQty * unitPrice;

  const grossUnitPrice = (calloutGrossUnitPrice && calloutUnitPrice)
    ? calloutGrossUnitPrice * (unitPrice / calloutUnitPrice)
    : calloutGrossUnitPrice;

  const tax = priceData.tax || line._tax || line.tax || null;
  const uOM = priceData.uOM || line._uOM || line.uOM || null;
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: negQty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    ...(discount ? { etgoDiscount: discount } : {}),
    lineNetAmount,
    tax,
    uOM,
    lineNo,
    sourceInvoiceLineId: line.id,
  };
};

export default function ImportFromSourceInvoiceModal(props) {
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="purchase-invoice/lines"
      titleKey="importFromSourceInvoice"
      searchPlaceholderKey="searchSourceInvoice"
      emptyMessageKey="noFacSourceInvoicesForSupplier"
      noSearchResultsKey="noSourceInvoicesMatchYourSearch"
      successMessageKey="linesImportedFromSourceInvoice"
      showPriceColumns={false}
      negativeQuantity
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
      afterImport={afterImport}
    />
  );
}
