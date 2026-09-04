// ETP-5125 (CP-1) — end-to-end coverage of what a real user reads on the
// printable: real locale JSON -> useUI() resolution -> buildXxxPdfLabels() ->
// the {{labels.*}} the template renders.
//
// The other suites mock `useUI` as `(key) => key`, which is fine for structural
// assertions but silently hides exactly this ticket's bug class: the wiring was
// always correct, the LOCALE VALUE was wrong ("IVA%" for a column printing the
// tax name, "IVA"/"Subtotal (sin IVA)" contradicting the on-screen totals
// panel). So this file resolves against the real dictionaries.
//
// All four commercial documents are covered at once because none of the four
// buildXxxPdfLabels() overrides the tax keys — they all inherit them from the
// single shared buildDocumentPdfLabels().

import { buildDocumentPdfLabels } from '../documentPdf.js';
import { buildInvoicePdfLabels } from '../useInvoicePdf.js';
import { buildSalesOrderPdfLabels } from '../useOrderPdf.js';
import { buildPurchaseOrderPdfLabels } from '../usePurchaseOrderPdf.js';
import { buildQuotationPdfLabels } from '../useQuotationPdf.js';
import { loadLocaleDictionary, makeRealUI } from './testUtils/realLocaleUI.js';

const COL_TAX_ES = 'Impuesto';
const TAX_ES = 'Impuestos';
const SUBTOTAL_ES = 'Subtotal (sin impuestos)';
const CURRENCY_ES = 'Moneda:';

/** Every label builder that feeds DOCUMENT_TEMPLATE, one per commercial document. */
const LABEL_BUILDERS = [
  ['sales-invoice', buildInvoicePdfLabels],
  ['sales-order', buildSalesOrderPdfLabels],
  ['purchase-order', buildPurchaseOrderPdfLabels],
  ['sales-quotation', buildQuotationPdfLabels],
];

const uiEs = makeRealUI(loadLocaleDictionary('es_ES'));
const uiEn = makeRealUI(loadLocaleDictionary('en_US'));
const uiAr = makeRealUI(loadLocaleDictionary('es_AR'));

describe('buildDocumentPdfLabels with the real es_ES dictionary (ETP-5125)', () => {
  const labels = buildDocumentPdfLabels(uiEs, {});

  it('labels the lines-table tax column "Impuesto"', () => {
    expect(labels.colTax).toBe(COL_TAX_ES);
  });

  it('labels the Totals rows "Impuestos" and "Subtotal (sin impuestos)"', () => {
    expect(labels.tax).toBe(TAX_ES);
    expect(labels.subtotal).toBe(SUBTOTAL_ES);
  });

  it('exposes the new header currency label', () => {
    expect(labels.currency).toBe(CURRENCY_ES);
  });

  it('mentions no single concrete tax in any of the three tax labels', () => {
    for (const value of [labels.colTax, labels.tax, labels.subtotal]) {
      expect(value).not.toMatch(/IVA/);
    }
  });
});

describe.each(LABEL_BUILDERS)('%s printable labels resolve against real locales (ETP-5125)', (_name, buildLabels) => {
  it('inherits the generic Spanish tax wording', () => {
    const labels = buildLabels(uiEs);
    expect(labels.colTax).toBe(COL_TAX_ES);
    expect(labels.tax).toBe(TAX_ES);
    expect(labels.subtotal).toBe(SUBTOTAL_ES);
  });

  it('inherits the Spanish currency label', () => {
    expect(buildLabels(uiEs).currency).toBe(CURRENCY_ES);
  });

  it('inherits the same wording in es_AR', () => {
    const labels = buildLabels(uiAr);
    expect(labels.colTax).toBe(COL_TAX_ES);
    expect(labels.tax).toBe(TAX_ES);
    expect(labels.currency).toBe(CURRENCY_ES);
  });

  it('resolves the English wording without a stray percent sign', () => {
    const labels = buildLabels(uiEn);
    expect(labels.colTax).toBe('Tax');
    expect(labels.tax).toBe('Taxes');
    expect(labels.subtotal).toBe('Subtotal (excl. taxes)');
    expect(labels.currency).toBe('Currency:');
  });

  // makeRealUI falls back to the raw key when a locale entry is missing, so an
  // un-added key would surface as the literal key text inside the PDF.
  it('never leaks a raw locale key into the printed labels', () => {
    const labels = buildLabels(uiEs);
    for (const value of Object.values(labels)) {
      expect(value).not.toMatch(/^invoicePdf/);
    }
  });
});
