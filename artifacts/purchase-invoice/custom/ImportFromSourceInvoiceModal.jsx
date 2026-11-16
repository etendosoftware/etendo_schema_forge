import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import { listAll, listLines } from '@/windows/custom/shared/importActionClient.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { newestCreatedFirst } from '@/windows/custom/shared/invoiceOrderImport.js';

/**
 * Import invoice lines from a completed standard ("Factura") purchase invoice
 * for the same supplier — the manual counterpart to generating a rectificative
 * invoice from a Goods Return. Available only for RECTIFICATIVA-subtype
 * purchase invoices — enforced at the call site (see
 * PurchaseInvoiceBottomPanel.jsx).
 *
 * Per ETP-4737 acceptance criteria ("Importar desde Factura origen muestra
 * solo facturas de Tipo Factura"): the source-invoice picker lists plain
 * (FAC) invoices only — a rectificative invoice can never be used to rectify
 * another rectificative invoice. Since ETP-6099 the `availableOriginInvoices`
 * action decides it server-side (it used to be filtered here with
 * `getApSubtype()`, `apInvoiceSubtype` being a GET-time virtual field).
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
 * (`enrichSourceInvoiceLineId`). Since ETP-6099 the server reads that link: an
 * `availableOriginInvoiceLines` row says `importedHere`, and `fetchLines` marks it
 * `_alreadyImported`, blocking re-selection.
 */

const resolveLinePrice = async (base, productId, qty, invoiceHeader, auxData = {}) => {
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
    const res = await moduleApiFetch(`${base}/purchase-invoice/lines/callout`, {
      method: 'POST',
      
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

const SPEC = 'purchase-invoice';

/**
 * ETP-6099 (speed): the candidates come from THIS invoice's `availableOriginInvoices` action
 * (com.etendoerp.go `ImportOriginInvoiceLinesHandler`, the one the MCP calls): the supplier's
 * completed, non-rectificative (FAC) invoices, newest created first (re-sorted by the row's
 * `creationDate`, the action answers by invoice date), every page read, no currency filter (as
 * before). `detail` adds the row `amount` (the doc total), and `includeCovered` also brings the
 * ones whose lines are all imported here (pendingLines 0), which the row hides as before. It
 * replaced the company-wide 500-invoice GET filtered here and this invoice's lines GET.
 */
const fetchDocuments = async ({ base, invoiceId }) => {
  const rows = await listAll({
    apiFetch: moduleApiFetch, base, spec: SPEC, targetId: invoiceId,
    action: 'availableOriginInvoices', params: { includeCovered: true, detail: true },
  }).then(newestCreatedFirst);
  return {
    documents: rows.map(r => ({ ...r, invoiceDate: r.date, documentStatus: 'CO' })),
    sharedContext: { invoiceId },
    excludedByCurrency: false,
  };
};

/**
 * One `availableOriginInvoiceLines` call per source invoice; `detail` adds the price, quantity
 * and `importedHere` keys the popup reads. `includeCovered` brings the lines
 * already imported here at pendingQuantity 0 with `importedHere`; they are shown (greyed) with the
 * source line's own quantity, as before. The row carries the price, discount, tax and UoM
 * `buildLineBody` falls back to (the product callout still runs at import time).
 */
const fetchLines = async ({ base, docId, sharedContext }) => {
  const invoiceId = sharedContext?.invoiceId;
  if (!invoiceId) return [];
  const lines = await listLines({
    apiFetch: moduleApiFetch, base, spec: SPEC, targetId: invoiceId,
    action: 'availableOriginInvoiceLines', params: { invoiceId: docId, includeCovered: true, detail: true },
  });
  return lines.map(l => {
    const imported = !!l.importedHere;
    const qty = imported ? Math.abs(Number(l.invoicedQuantity)) || 0 : (Number(l.pendingQuantity) || 0);
    const unitPrice = Number(l.unitPrice) || 0;
    return {
      ...l,
      etgoDiscount: l.discount ?? l.etgoDiscount,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: qty,
      _unitPrice: unitPrice,
      _lineNetAmount: unitPrice * qty,
      _tax: l.tax || null,
      _uOM: l.uOM || null,
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

const afterImport = async ({ importedDocIds, base, invoiceId }) => {
  // ETP-4919: importing from a second (or third...) source invoice must not lose the link to
  // the ones already imported — send the FULL set, not just guard on exactly one.
  if (importedDocIds.size === 0) return;
  try {
    await moduleApiFetch(`${base}/purchase-invoice/header/${invoiceId}`, {
      method: 'PATCH',
      
      body: JSON.stringify({ originInvoices: [...importedDocIds] }),
    });
  } catch {
    // best-effort — the lines are already imported regardless of this link.
  }
};

const buildLineBody = async ({ line, qty, invoiceId, lineNo, base }) => {
  const priceData = await resolveLinePrice(base, line.product, qty, {});
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
      linesEndpoint="purchase-invoice/lines"
      titleKey="importFromSourceInvoice"
      searchPlaceholderKey="searchSourceInvoice"
      emptyMessageKey="noFacSourceInvoicesForSupplier"
      noSearchResultsKey="noSourceInvoicesMatchYourSearch"
      successMessageKey="linesImportedFromSourceInvoice"
      showPriceColumns={false}
      negativeQuantity
      fetchDocuments={handlers.fetchDocuments}
      fetchLines={handlers.fetchLines}
      getDocDisplay={getDocDisplay}
      eagerLoadLines={false}
      isDocumentCovered={isDocumentCovered}
      getDocumentTotal={getDocumentTotal}
      buildLineBody={buildLineBody}
      afterImport={afterImport}
    />
  );
}
