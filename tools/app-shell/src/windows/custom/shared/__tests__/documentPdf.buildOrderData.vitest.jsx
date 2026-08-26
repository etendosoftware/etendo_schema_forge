// ETP-4777 — buildOrderData() (used by useOrderPdf/usePurchaseOrderPdf, the
// client-rendered "Enviar/Descargar" PDF for Sales/Purchase Order) must show
// the backend-persisted grand total (header.grandTotalAmount), exactly like
// its siblings buildInvoiceData()/buildQuotationData() already do — never a
// client-side recompute via computeDocumentTotals, which can diverge from
// the trigger-computed value persisted in C_Order.GrandTotal (Case 2 of the
// reported bug). Mocks must come before imports.

vi.mock('@/lib/locationAddress.js', () => ({
  buildLocationAddressLines: vi.fn(() => []),
}));

// Deliberately returns a grandTotal/taxAmt that differs from the mocked
// header's persisted grandTotalAmount below, so a test that still asserts
// on this mock's output (instead of the header field) proves the bug.
vi.mock('@/lib/documentTotals', () => ({
  computeDocumentTotals: vi.fn(() => ({
    grossSubtotal: 100,
    netSubtotal: 100,
    grandTotal: 89.19, // <-- the buggy client recompute (must NOT be what's shown)
    discountAmt: 0,
    taxAmt: 19.19,
    totalDiscountAmt: 0,
  })),
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'listPrice', discountField: 'discount', grossField: 'lineGrossAmount' },
}));

const mockFetchJson = vi.fn();
const mockFetchAll = vi.fn();
const mockFetchOptionalJson = vi.fn();

vi.mock('../pdfUtils.js', () => ({
  COMMON_HANDLEBARS_HELPERS: '',
  fetchJson: (...args) => mockFetchJson(...args),
  fetchAll: (...args) => mockFetchAll(...args),
  fetchOptionalJson: (...args) => mockFetchOptionalJson(...args),
  fetchLocationAddress: vi.fn(() => Promise.resolve(null)),
  fetchImageDataUrl: vi.fn(() => Promise.resolve(null)),
  renderPdf: vi.fn(),
  blobToDataUrl: vi.fn(),
}));

import { buildOrderData } from '../documentPdf.js';

// Header carries the backend-persisted total (Grid's "Imp. Total" — the value
// the ticket says the Form/Preview panel disagreed with, e.g. 89.21 vs 89.19).
const PERSISTED_HEADER = {
  documentNo: '1000087',
  grandTotalAmount: 89.21,
  totalLines: 70.00,
  etgoTotalDiscount: 0,
  businessPartner$_identifier: 'Blanquiceleste S.A.',
};

beforeEach(() => {
  mockFetchJson.mockReset();
  mockFetchAll.mockReset();
  mockFetchOptionalJson.mockReset();
  mockFetchJson.mockResolvedValue(PERSISTED_HEADER);
  mockFetchAll.mockResolvedValue([
    { lineNo: 1, orderedQuantity: 1, listPrice: 70, discount: 0, lineGrossAmount: 70 },
  ]);
  mockFetchOptionalJson.mockResolvedValue(null);
});

describe('buildOrderData — ETP-4777 Case 2 (Send/Preview PDF for Sales/Purchase Order)', () => {
  it('uses the persisted header.grandTotalAmount, not the client-side computeDocumentTotals recompute', async () => {
    const result = await buildOrderData('sales-order', 'REC123', 'https://api.example', 'tok');
    expect(result.grandTotal).toBe(89.21);
  });

  it('derives taxAmount from the persisted header fields (grandTotal - netAmount), not from computeDocumentTotals', async () => {
    const result = await buildOrderData('sales-order', 'REC123', 'https://api.example', 'tok');
    // 89.21 (persisted grandTotal) - 70.00 (persisted totalLines) = 19.21,
    // NOT the mocked computeDocumentTotals().taxAmt of 19.19.
    expect(result.taxAmount).toBeCloseTo(19.21, 2);
  });

  it('same fix applies to Purchase Order (shared buildOrderData, different spec)', async () => {
    const result = await buildOrderData('purchase-order', 'REC456', 'https://api.example', 'tok');
    expect(result.grandTotal).toBe(89.21);
  });
});

// ETP-4941 — the printed "CÓD." column must show the product SKU
// (product$_value), not the line number. buildOrderData() is shared by
// sales-order and purchase-order.
describe('buildOrderData — ETP-4941 (CÓD. column shows product SKU, not line number)', () => {
  it('sets productCode from product$_value on each line', async () => {
    mockFetchAll.mockResolvedValue([
      { lineNo: 1, orderedQuantity: 1, listPrice: 70, discount: 0, lineGrossAmount: 70, 'product$_value': 'SKU-001' },
    ]);
    const result = await buildOrderData('sales-order', 'REC123', 'https://api.example', 'tok');
    expect(result.lines[0].productCode).toBe('SKU-001');
    expect(result.lines[0].productCode).not.toBe(result.lines[0].lineNo);
  });

  it('falls back to line.productCode when set directly on the raw line', async () => {
    mockFetchAll.mockResolvedValue([
      { lineNo: 1, orderedQuantity: 1, listPrice: 70, discount: 0, lineGrossAmount: 70, productCode: 'DIRECT-CODE' },
    ]);
    const result = await buildOrderData('sales-order', 'REC123', 'https://api.example', 'tok');
    expect(result.lines[0].productCode).toBe('DIRECT-CODE');
  });

  it('falls back to "—" (never the line number) when neither productCode nor product$_value is present — AC: product with no SKU', async () => {
    mockFetchAll.mockResolvedValue([
      { lineNo: 5, orderedQuantity: 1, listPrice: 70, discount: 0, lineGrossAmount: 70 },
    ]);
    const result = await buildOrderData('sales-order', 'REC123', 'https://api.example', 'tok');
    expect(result.lines[0].productCode).toBe('—');
    // Must not be indistinguishable from the original bug (line number shown as code).
    expect(result.lines[0].productCode).not.toBe(String(result.lines[0].lineNo));
    expect(result.lines[0].productCode).not.toBe('5');
    expect(result.lines[0].productCode).not.toBe('1');
  });

  it('applies the same productCode resolution to Purchase Order lines', async () => {
    mockFetchAll.mockResolvedValue([
      { lineNo: 1, orderedQuantity: 1, listPrice: 70, discount: 0, lineGrossAmount: 70, 'product$_value': 'PO-SKU-9' },
    ]);
    const result = await buildOrderData('purchase-order', 'REC456', 'https://api.example', 'tok');
    expect(result.lines[0].productCode).toBe('PO-SKU-9');
  });
});
