/**
 * @covers tools/app-shell/src/windows/custom/shared/printableSources.js
 * @covers tools/app-shell/vite-plugins/printables-publish.js
 * @covers tools/app-shell/src/windows/custom/shared/useInvoicePdf.js
 * @covers tools/app-shell/src/windows/custom/shared/useQuotationPdf.js
 * @covers tools/app-shell/src/windows/custom/shared/documentPdf.js
 * @covers tools/app-shell/src/windows/custom/goods-shipment/useShipmentPdf.js
 * @covers tools/app-shell/src/windows/custom/return-to-vendor-shipment/useReturnToVendorPdf.js
 * @covers tools/app-shell/src/windows/custom/return-material-receipt/useReturnReceiptPdf.js
 *
 * The published printable manifest (what the backend fetches to render a completed
 * document server-side) must be exactly what the browser sends to jsreport. These tests
 * capture the browser's real jsreport call and compare the manifest against it, so a
 * template, CSS, helper, chrome or label change that reaches one and not the other fails
 * here instead of producing two different PDFs for one record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@etendosoftware/app-shell-core/auth/api', () => ({ apiFetch: apiFetchMock }));

import { renderDocumentPdf, buildOrderData } from '../documentPdf.js';
import { buildInvoiceData, buildInvoicePdfLabels } from '../useInvoicePdf.js';
import { buildSalesOrderPdfLabels } from '../useOrderPdf.js';
import { buildPurchaseOrderPdfLabels } from '../usePurchaseOrderPdf.js';
import { buildQuotationData, buildQuotationPdfLabels } from '../useQuotationPdf.js';
import {
  PRINTABLE_DOCUMENTS,
  HELPER_PLACEHOLDERS,
  PRINTABLE_MANIFEST_VERSION,
  buildPrintableManifest,
} from '../printableSources.js';
import * as printableSources from '../printableSources.js';
import { buildAllManifests } from '../../../../../vite-plugins/printables-publish.js';
import {
  buildShipmentData, generateShipmentPdf, getShipmentPdfLabels,
} from '../../goods-shipment/useShipmentPdf.js';
import {
  buildReturnToVendorData, generateReturnToVendorPdf, getReturnToVendorPdfLabels,
} from '../../return-to-vendor-shipment/useReturnToVendorPdf.js';
import {
  buildReceiptData, generateReturnReceiptPdf, getReturnReceiptPdfLabels,
} from '../../return-material-receipt/useReturnReceiptPdf.js';

/** A tiny dictionary per locale; a key missing from it falls back to the key, as useUI does. */
const DICTIONARIES = {
  es_ES: { genericLabels: { invoicePdfTitle: 'Factura', orderPdfTitle: 'Pedido', invoicePdfTax: 'Impuestos' } },
  en_US: { genericLabels: { invoicePdfTitle: 'Invoice', orderPdfTitle: 'Order', invoicePdfTax: 'Taxes' } },
};

/** The backend's substitution, written the way the placeholders document it. */
function fillHelpers(manifest, { thousandsSeparator, decimalSeparator, rateDecimals }) {
  const p = manifest.helperPlaceholders;
  return manifest.helpers
    .split(JSON.stringify(p.thousandsSeparator)).join(JSON.stringify(thousandsSeparator))
    .split(JSON.stringify(p.decimalSeparator)).join(JSON.stringify(decimalSeparator))
    .split(p.rateDecimals).join(String(rateDecimals));
}

/** What the browser POSTs to /jsreport/api/report for one rendered document. */
async function captureBrowserPayload(data) {
  apiFetchMock.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['%PDF'])) });
  await renderDocumentPdf(data);
  const [, init] = apiFetchMock.mock.calls.at(-1);
  return JSON.parse(init.body);
}

const LABEL_BUILDERS = {
  'sales-invoice': buildInvoicePdfLabels,
  'sales-order': buildSalesOrderPdfLabels,
  'purchase-order': buildPurchaseOrderPdfLabels,
  'sales-quotation': buildQuotationPdfLabels,
};

describe('published printable manifest = what the browser sends to jsreport', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('carries the browser template, css and chrome options byte for byte', async () => {
    const sent = await captureBrowserPayload({ rateDecimals: 2 });
    const manifest = buildPrintableManifest('sales-invoice', DICTIONARIES);

    expect(manifest.template.content).toBe(sent.template.content);
    expect(manifest.template.engine).toBe(sent.template.engine);
    expect(manifest.template.recipe).toBe(sent.template.recipe);
    expect(manifest.template.chrome).toEqual(sent.template.chrome);
    expect(manifest.css).toBe(sent.data.css);
  });

  it.each([
    [2, { thousandsSeparator: '.', decimalSeparator: ',' }],
    [6, { thousandsSeparator: '.', decimalSeparator: ',' }],
  ])('reproduces the browser helpers once its placeholders are filled (rateDecimals=%s)', async (rateDecimals, seps) => {
    // The browser bakes the instance separators (defaults until /currency-format loads)
    // and the exchange-rate precision into the string; the manifest leaves them as tokens.
    const sent = await captureBrowserPayload({ rateDecimals });
    const manifest = buildPrintableManifest('sales-invoice', DICTIONARIES);

    expect(fillHelpers(manifest, { ...seps, rateDecimals })).toBe(sent.template.helpers);
  });

  it('leaves no placeholder behind and carries each one at least once', () => {
    const manifest = buildPrintableManifest('sales-invoice', DICTIONARIES);
    for (const token of Object.values(HELPER_PLACEHOLDERS)) {
      expect(manifest.helpers).toContain(token);
    }
    const filled = fillHelpers(manifest, { thousandsSeparator: ' ', decimalSeparator: '.', rateDecimals: 3 });
    expect(filled).not.toMatch(/@@SF_[A-Z_]+@@/);
    expect(filled).toContain('__groupEsEs(num, 3, 3)');
  });

  it.each(Object.keys(LABEL_BUILDERS))('publishes, per locale, the labels the browser builds for %s', (document) => {
    const manifest = buildPrintableManifest(document, DICTIONARIES);
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      const ui = (key) => dictionary.genericLabels[key] ?? key;
      expect(manifest.labels[locale]).toEqual(LABEL_BUILDERS[document](ui));
    }
  });

  it('labels an unknown key with the key itself, exactly like useUI', () => {
    const manifest = buildPrintableManifest('sales-invoice', { es_ES: { genericLabels: {} } });
    expect(manifest.labels.es_ES.title).toBe('invoicePdfTitle');
  });

  it('refuses a document it does not publish', () => {
    expect(() => buildPrintableManifest('goods-receipt', DICTIONARIES)).toThrow(/Unknown printable document/);
  });
});

describe('printables-publish plugin', () => {
  it('emits one manifest per published document, stamped with the build instant', () => {
    const manifests = buildAllManifests(printableSources, DICTIONARIES, 1234);

    expect(Object.keys(manifests).sort()).toEqual(
      Object.keys(PRINTABLE_DOCUMENTS).map((d) => `${d}.json`).sort(),
    );
    const invoice = manifests['sales-invoice.json'];
    expect(invoice.manifestVersion).toBe(PRINTABLE_MANIFEST_VERSION);
    expect(invoice.document).toBe('sales-invoice');
    expect(invoice.family).toBe('commercial');
    expect(invoice.builtAt).toBe(1234);
    expect(Object.keys(invoice.labels).sort()).toEqual(['en_US', 'es_ES']);
  });
});

/** Serves a fixture to the builder's three reads: header, lines, session. */
function serveFixture(header, lines, session) {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url) => {
    const u = String(url);
    const isLines = u.includes('parentId=');
    const isHeader = !isLines && !u.endsWith('/session');
    const body = isHeader ? { response: { data: [header] } }
      : isLines ? { response: { data: lines } } : { response: { data: session } };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
}

/**
 * The data half of the server render is a Java port (com.etendoerp.go SalesInvoicePrintableData).
 * This fixture is mirrored, input and expected output, by PrintableDataTest
 * ("the same data as buildInvoiceData for the shared fixture"): change buildInvoiceData's shape and
 * this test fails here; then update the Java port and its copy of the fixture in the same change.
 */
describe('buildInvoiceData — the shared parity fixture of the server-side port', () => {
  const HEADER = {
    documentNo: 'INV-001', grandTotalAmount: 121, summedLineAmount: 100,
    'businessPartner$_identifier': 'ACME Corp', 'currency$_identifier': 'EUR',
    invoiceDate: '2026-10-30', 'paymentMethod$_identifier': 'Transfer',
    'paymentTerms$_identifier': '30 days', description: 'Thanks', etgoTotalDiscount: 0,
    bpAddress: 'Main St 1',
  };
  const LINES = [
    { lineNo: 20, 'product$_identifier': 'Widget', productCode: 'W-1', invoicedQuantity: 2,
      unitPrice: 45, listPrice: 50, etgoDiscount: 10, 'tax$_identifier': 'IVA 21%', lineNetAmount: 90 },
    { lineNo: 10, 'product$_identifier': 'Gadget', invoicedQuantity: 1, unitPrice: 10,
      'tax$_identifier': 'IVA 21%', lineNetAmount: 10 },
  ];
  const SESSION = {
    organization: { name: 'Org SL', address1: 'Calle 1', address2: null, cityLine: '08001 - Barcelona', taxId: 'B123' },
  };

  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url) => {
      const body = String(url).includes('/header/') ? { response: { data: [HEADER] } }
        : String(url).includes('/lines') ? { response: { data: LINES } }
          : { response: { data: SESSION } };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });
  });

  it('builds exactly the data the Java port must build', async () => {
    const data = await buildInvoiceData('INV1', '/sws/neo', 'tok');
    expect(data).toEqual({
      companyName: 'Org SL', companyAddress1: 'Calle 1', companyAddress2: null,
      companyCityLine: '08001 - Barcelona', companyTaxId: 'B123', companyLogoDataUrl: null,
      hasCustomerAddress: true, customerAddressLines: ['Main St 1'],
      documentNo: 'INV-001', currencyCode: 'EUR', invoiceDate: '2026-10-30',
      customerName: 'ACME Corp', paymentMethod: 'Transfer', paymentTerms: '30 days', notes: 'Thanks',
      lines: [
        { lineNo: 10, productCode: '—', productName: 'Gadget', quantity: 1, unitPrice: 10,
          discount: null, taxName: 'IVA 21%', lineTotal: 10 },
        { lineNo: 20, productCode: 'W-1', productName: 'Widget', quantity: 2, unitPrice: 45,
          discount: 10, taxName: 'IVA 21%', lineTotal: 90 },
      ],
      netAmount: 100, taxAmount: 21, grandTotal: 121,
      grossAmount: 110, grossSubtotal: 110, discountPerProduct: -10,
      etgoTotalDiscount: null, totalDiscountPct: null, totalDiscountAmt: null,
      hasAnyDiscount: true, hasTotalDiscount: false, verifactuQrDataUrl: null,
    });
  });
});

/**
 * Same contract for the order builder (Java OrderPrintableData) and the quotation builder (Java
 * QuotationPrintableData), on the print path (no currencyData), as documentPdfRegistry.js calls them.
 * Mirrored by PrintableDataTest.
 */
describe('buildOrderData / buildQuotationData — the shared parity fixtures of the server-side ports', () => {
  it('order: builds exactly the data the Java port must build', async () => {
    serveFixture({
      documentNo: 'SO-1', grandTotalAmount: 121, summedLineAmount: 100,
      'businessPartner$_identifier': 'ACME Corp', 'currency$_identifier': 'EUR', orderDate: '2026-10-30',
      'paymentMethod$_identifier': 'Transfer', 'paymentTerms$_identifier': '30 days', description: null,
      etgoTotalDiscount: 5, bpAddress: 'Main St 1',
    }, [
      { lineNo: 10, 'product$_identifier': 'Widget', 'product$_value': 'W-1', orderedQuantity: 2,
        listPrice: 50, unitPrice: 45, discount: 10, 'tax$_identifier': 'IVA 21%', lineGrossAmount: 108.9,
        lineNetAmount: 90 },
    ], { organization: { name: 'Org SL' }, currencyStandardPrecision: 2 });

    const data = await buildOrderData('sales-order', 'SO1', '/sws/neo', 'tok', null);

    expect(data).toEqual({
      companyName: 'Org SL', companyAddress1: null, companyAddress2: null, companyCityLine: null,
      companyTaxId: null, companyLogoDataUrl: null, hasCustomerAddress: true,
      customerAddressLines: ['Main St 1'],
      documentNo: 'SO-1', currencyCode: 'EUR', invoiceDate: '2026-10-30', customerName: 'ACME Corp',
      paymentMethod: 'Transfer', paymentTerms: '30 days', notes: null,
      lines: [{ lineNo: 10, productCode: 'W-1', productName: 'Widget', quantity: 2, unitPrice: 50,
        discount: 10, taxName: 'IVA 21%', lineTotal: 108.9 }],
      netAmount: 100, taxAmount: 21, grandTotal: 121,
      grossAmount: 100, discountPerProduct: -10, etgoTotalDiscount: 5, totalDiscountAmt: -4.5,
      exchangeRate: null, orgCurrencyCode: null, orgGrandTotal: null, rateDecimals: 2,
    });
  });

  it('quotation: builds exactly the data the Java port must build', async () => {
    serveFixture({
      documentNo: 'QT-1', grandTotalAmount: 110, summedLineAmount: 100,
      'businessPartner$_identifier': 'ACME Corp', 'currency$_identifier': 'USD', orderDate: '2026-10-30',
      validUntil: '2026-11-30', etgoTotalDiscount: 0, 'partnerAddress$_identifier': 'Elm St 2',
    }, [
      { lineNo: 10, 'product$_identifier': 'Gadget', orderedQuantity: 4, unitPrice: 25,
        'tax$_identifier': 'VAT 10%', lineNetAmount: 100 },
    ], { organization: { name: 'Org SL' } });

    const data = await buildQuotationData('QT1', '/sws/neo', 'tok', null);

    expect(data).toEqual({
      companyName: 'Org SL', companyAddress1: null, companyAddress2: null, companyCityLine: null,
      companyTaxId: null, companyLogoDataUrl: null, hasCustomerAddress: true,
      customerAddressLines: ['Elm St 2'],
      documentNo: 'QT-1', currencyCode: 'USD', invoiceDate: '2026-10-30', validUntil: '2026-11-30',
      customerName: 'ACME Corp', paymentMethod: null, paymentTerms: null, notes: null,
      lines: [{ lineNo: 10, productCode: '—', productName: 'Gadget', quantity: 4, unitPrice: 25,
        discount: null, taxName: 'VAT 10%', lineTotal: 100 }],
      netAmount: 100, taxAmount: 10, grandTotal: 110,
      grossAmount: null, discountPerProduct: null, etgoTotalDiscount: null, totalDiscountAmt: null,
      exchangeRate: null, orgCurrencyCode: null, orgGrandTotal: null, rateDecimals: 4,
    });
  });
});

/**
 * The movement family (ETP-6013): each hook composes its template from the shared fragments and
 * its own body, and the manifest composes it with movementTemplate(); this proves both give the
 * browser's exact jsreport call. The data fixtures are mirrored by PrintableDataTest's
 * movement tests (the Java MovementPrintableData ports).
 */
describe('movement printables — manifest = the browser call, and the shared data fixtures', () => {
  const HEADER = {
    documentNo: 'MV-1', movementDate: '2026-10-30', 'businessPartner$_identifier': 'ACME Corp',
    'warehouse$_identifier': 'Main WH', description: 'Fragile', 'partnerAddress$_identifier': 'Elm St 2',
    'salesOrder$_identifier': 'SO-7 - 30-10-2026', documentStatus: 'CO', 'documentStatus$_identifier': 'Completed',
    sourceReceiptDocNo: 'GR-3', sourceShipmentDocNo: 'GS-4',
    issuerOrg: { name: 'Org SL', address1: 'Calle 1', cityLine: '08001 - Barcelona', taxId: 'B123' },
  };
  const LINES = [
    { lineNo: 20, 'product$_identifier': 'Widget', 'product$_value': 'W-1', movementQuantity: 2, orderLineQty: 3, orderQuantity: 5 },
    { lineNo: 10, 'product$_identifier': 'Gadget', movementQuantity: 1.5 },
  ];
  const COMPANY = {
    companyName: 'Org SL', companyAddress1: 'Calle 1', companyAddress2: null,
    companyCityLine: '08001 - Barcelona', companyTaxId: 'B123', companyLogoDataUrl: null,
  };
  const ui = (key) => key;

  it.each([
    ['goods-shipment', generateShipmentPdf, getShipmentPdfLabels],
    ['return-to-vendor-shipment', generateReturnToVendorPdf, getReturnToVendorPdfLabels],
    ['return-material-receipt', generateReturnReceiptPdf, getReturnReceiptPdfLabels],
  ])('%s: the manifest carries the browser template, css, helpers, chrome and labels', async (document, generate, labelsOf) => {
    serveFixture(HEADER, LINES, {});
    const calls = [];
    const original = apiFetchMock.getMockImplementation();
    apiFetchMock.mockImplementation((url, init) => {
      if (String(url).includes('/jsreport/api/report')) {
        calls.push(JSON.parse(init.body));
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['%PDF'])) });
      }
      return original(url, init);
    });

    await generate('MV1', '/sws/neo/' + document, 'tok', labelsOf(ui));

    const sent = calls.at(-1);
    const manifest = buildPrintableManifest(document, { en_US: { genericLabels: {} } });
    expect(manifest.family).toBe('movement');
    expect(manifest.template.content).toBe(sent.template.content);
    expect(manifest.template.chrome).toEqual(sent.template.chrome);
    expect(manifest.css).toBe(sent.data.css);
    expect(manifest.helpers).toBe(sent.template.helpers);
    expect(manifest.labels.en_US).toEqual(sent.data.labels);
  });

  it('shipment: builds exactly the data the Java port must build', async () => {
    serveFixture(HEADER, LINES, {});
    expect(await buildShipmentData('MV1', '/sws/neo', 'tok')).toEqual({
      ...COMPANY, documentNo: 'MV-1', documentStatusLabel: 'Completed', documentStatusClass: 'status-co',
      movementDate: '2026-10-30', customerName: 'ACME Corp', customerAddressLines: ['Elm St 2'],
      warehouse: 'Main WH', salesOrderRef: 'SO-7', notes: 'Fragile',
      lines: [
        { lineNo: 1, productCode: '1', productName: 'Gadget', orderedQty: 0, deliveredQty: 1.5 },
        { lineNo: 2, productCode: 'W-1', productName: 'Widget', orderedQty: 3, deliveredQty: 2 },
      ],
    });
  });

  it('return to vendor: builds exactly the data the Java port must build', async () => {
    serveFixture(HEADER, LINES, {});
    expect(await buildReturnToVendorData('MV1', '/sws/neo', 'tok')).toEqual({
      ...COMPANY, documentNo: 'MV-1', movementDate: '2026-10-30', customerName: 'ACME Corp',
      customerAddressLines: ['Elm St 2'], warehouse: 'Main WH', sourceReceiptRef: 'GR-3', notes: 'Fragile',
      lines: [
        { lineNo: 1, productCode: '1', productName: 'Gadget', returnedQty: 1.5, originalQty: 0 },
        { lineNo: 2, productCode: 'W-1', productName: 'Widget', returnedQty: 2, originalQty: 5 },
      ],
    });
  });

  it('return receipt: builds exactly the data the Java port must build', async () => {
    serveFixture(HEADER, LINES, {});
    expect(await buildReceiptData('MV1', '/sws/neo', 'tok')).toEqual({
      ...COMPANY, documentNo: 'MV-1', movementDate: '2026-10-30', customerName: 'ACME Corp',
      customerAddressLines: ['Elm St 2'], warehouse: 'Main WH', sourceShipmentRef: 'GS-4', notes: 'Fragile',
      lines: [
        { lineNo: 1, productCode: '1', productName: 'Gadget', returnedQty: 1.5 },
        { lineNo: 2, productCode: 'W-1', productName: 'Widget', returnedQty: 2 },
      ],
    });
  });
});
