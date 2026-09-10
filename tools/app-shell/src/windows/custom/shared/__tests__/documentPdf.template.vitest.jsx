// ETP-4941 — [PDF] Presupuesto, Pedido y Factura de Venta, y Pedido de Compra:
// columna CÓD. muestra número de línea en vez del SKU del producto.
//
// DOCUMENT_TEMPLATE is shared by useOrderPdf (sales-order), usePurchaseOrderPdf
// (purchase-order), useInvoicePdf (sales-invoice) and useQuotationPdf
// (sales-quotation) — this test compiles the real template with Handlebars
// (the same engine jsreport uses) and asserts the "CÓD." column renders
// each line's productCode, not its lineNo. Mocks must come before imports.

vi.mock('@/lib/locationAddress.js', () => ({
  buildLocationAddressLines: vi.fn(() => []),
}));

vi.mock('@/lib/documentTotals', () => ({
  computeDocumentTotals: vi.fn(() => ({
    grossSubtotal: 0, netSubtotal: 0, grandTotal: 0, discountAmt: 0, taxAmt: 0, totalDiscountAmt: 0,
  })),
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  ORDER_LINE_CONFIG: {},
}));

vi.mock('../pdfUtils.js', () => ({
  COMMON_HANDLEBARS_HELPERS: '',
  fetchJson: vi.fn(),
  fetchAll: vi.fn(),
  fetchOptionalJson: vi.fn(),
  fetchLocationAddress: vi.fn(),
  fetchImageDataUrl: vi.fn(),
  renderPdf: vi.fn(),
  blobToDataUrl: vi.fn(),
}));

import Handlebars from 'handlebars';
import { DOCUMENT_TEMPLATE, resolveProductCode } from '../documentPdf.js';

// jsreport registers formatCurrency/fmtDate/formatNumber server-side via the
// generated helpers string (buildJsreportHelpersString + COMMON_HANDLEBARS_HELPERS).
// Register no-op stand-ins here so the real template compiles standalone.
beforeAll(() => {
  Handlebars.registerHelper('formatCurrency', (v) => String(v));
  Handlebars.registerHelper('formatNumber', (v) => String(v));
  Handlebars.registerHelper('fmtDate', (v) => String(v));
});

const BASE_LABELS = {
  title: 'x', documentNo: 'x', customerSection: 'x', customer: 'x',
  documentSection: 'x', date: 'x', notes: 'x', page: 'x',
};

/**
 * Compiles the real DOCUMENT_TEMPLATE with a minimal valid data object.
 * `overrides` is merged last so a test can add/replace any template input
 * (e.g. `currencyCode`, or extra `labels`).
 */
function renderTemplate(overrides = {}) {
  const template = Handlebars.compile(DOCUMENT_TEMPLATE);
  return template({
    css: '',
    companyName: 'Test Co',
    documentNo: 'INV-1',
    labels: BASE_LABELS,
    customerName: 'ACME',
    invoiceDate: '2026-01-01',
    lines: [],
    ...overrides,
  });
}

function renderRows(lines) {
  return renderTemplate({ lines });
}

describe('DOCUMENT_TEMPLATE — lines table CÓD. column (ETP-4941)', () => {
  it('renders productCode in the code cell, not lineNo', () => {
    const html = renderRows([
      { lineNo: 1, productCode: 'SKU-777', productName: 'Widget', quantity: 2, unitPrice: 10, taxName: 'IVA', lineTotal: 20 },
    ]);
    expect(html).toContain('<td class="code">SKU-777</td>');
    expect(html).not.toContain('<td class="code">1</td>');
  });

  it('renders a distinct productCode per line, in the same order as the lines array', () => {
    const html = renderRows([
      { lineNo: 1, productCode: 'AAA-1', productName: 'First', quantity: 1, unitPrice: 5, taxName: '', lineTotal: 5 },
      { lineNo: 2, productCode: 'BBB-2', productName: 'Second', quantity: 1, unitPrice: 5, taxName: '', lineTotal: 5 },
    ]);
    const idxA = html.indexOf('AAA-1');
    const idxB = html.indexOf('BBB-2');
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
  });

  it('still renders the productName in the description cell alongside productCode', () => {
    const html = renderRows([
      { lineNo: 3, productCode: 'CCC-3', productName: 'Gizmo', quantity: 1, unitPrice: 1, taxName: '', lineTotal: 1 },
    ]);
    expect(html).toContain('<td class="code">CCC-3</td>');
    expect(html).toContain('<td class="desc">Gizmo</td>');
  });

  // ETP-4941 AC: "Presupuesto de Venta con un producto sin SKU → la columna
  // CÓD. queda vacía o muestra '—', no el número de línea."
  it('renders "—" in the code cell when the line has no SKU — never the line number', () => {
    const rawLine = { lineNo: 7, productName: 'No-SKU Product', quantity: 1, unitPrice: 1, taxName: '', lineTotal: 1 };
    const html = renderRows([
      { ...rawLine, productCode: resolveProductCode(rawLine) },
    ]);
    expect(html).toContain('<td class="code">—</td>');
    expect(html).not.toContain('<td class="code">7</td>');
  });
});

// ETP-5125 — the printable's header must state the document's currency
// (EUR/USD/GBP), and the Totals rows must keep routing their wording through
// {{labels.*}} so a locale change is the whole fix.
describe('DOCUMENT_TEMPLATE — document currency in the header (ETP-5125)', () => {
  const CURRENCY_LABEL = 'Moneda:';
  const CURRENCY_ROW_CLASS = 'class="currency"';

  function renderWithCurrency(currencyCode) {
    return renderTemplate({
      currencyCode,
      labels: { ...BASE_LABELS, currency: CURRENCY_LABEL },
    });
  }

  it('renders the label and the ISO code in the header meta block', () => {
    const html = renderWithCurrency('USD');
    expect(html).toContain(`<div ${CURRENCY_ROW_CLASS}>${CURRENCY_LABEL} USD</div>`);
  });

  it('places the currency inside .meta, after the document number', () => {
    const html = renderWithCurrency('EUR');
    const metaStart = html.indexOf('<div class="meta">');
    const docNoIdx = html.indexOf('<div class="num">INV-1</div>');
    const currencyIdx = html.indexOf(CURRENCY_ROW_CLASS);
    const metaEnd = html.indexOf('<!-- Info cards -->');
    expect(metaStart).toBeGreaterThan(-1);
    expect(currencyIdx).toBeGreaterThan(docNoIdx);
    expect(currencyIdx).toBeLessThan(metaEnd);
  });

  // No fallback to the org currency: an unresolved code must print nothing
  // rather than state the wrong currency on a customer-facing document.
  it.each([
    ['null', null],
    ['an empty string', ''],
    ['undefined', undefined],
  ])('omits the currency row entirely when currencyCode is %s', (_desc, currencyCode) => {
    const html = renderWithCurrency(currencyCode);
    expect(html).not.toContain(CURRENCY_ROW_CLASS);
    expect(html).not.toContain(CURRENCY_LABEL);
  });

  it('does not alter the existing header meta rows', () => {
    const html = renderWithCurrency('GBP');
    expect(html).toContain('<div class="num">INV-1</div>');
    expect(html).toContain('<div class="inv-company-name">Test Co</div>');
  });
});

describe('DOCUMENT_TEMPLATE — Totals rows stay label-driven (ETP-5125)', () => {
  it('renders labels.subtotal and labels.tax verbatim, with no hardcoded tax wording', () => {
    const html = renderTemplate({
      netAmount: 100,
      taxAmount: 21,
      grandTotal: 121,
      labels: {
        ...BASE_LABELS,
        subtotal: 'Subtotal (sin impuestos)',
        tax: 'Impuestos',
        grandTotal: 'Total',
      },
    });
    expect(html).toContain('<span>Subtotal (sin impuestos)</span>');
    expect(html).toContain('<span>Impuestos</span>');
    expect(html).not.toContain('IVA');
  });
});
