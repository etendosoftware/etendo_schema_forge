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
import { DOCUMENT_TEMPLATE } from '../documentPdf.js';

// jsreport registers formatCurrency/fmtDate/formatNumber server-side via the
// generated helpers string (buildJsreportHelpersString + COMMON_HANDLEBARS_HELPERS).
// Register no-op stand-ins here so the real template compiles standalone.
beforeAll(() => {
  Handlebars.registerHelper('formatCurrency', (v) => String(v));
  Handlebars.registerHelper('formatNumber', (v) => String(v));
  Handlebars.registerHelper('fmtDate', (v) => String(v));
});

function renderRows(lines) {
  const template = Handlebars.compile(DOCUMENT_TEMPLATE);
  return template({
    css: '',
    companyName: 'Test Co',
    documentNo: 'INV-1',
    labels: { title: 'x', documentNo: 'x', customerSection: 'x', customer: 'x', documentSection: 'x', date: 'x', notes: 'x', page: 'x' },
    customerName: 'ACME',
    invoiceDate: '2026-01-01',
    lines,
  });
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
});
