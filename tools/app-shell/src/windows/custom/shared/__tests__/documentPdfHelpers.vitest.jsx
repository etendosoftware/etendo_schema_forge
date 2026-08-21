// Mocks must come before imports

vi.mock('@/lib/locationAddress.js', () => ({
  buildLocationAddressLines: vi.fn((location, fallback) => {
    if (location?.addressLine1) return [location.addressLine1, location.city || ''];
    if (fallback) return [fallback];
    return [];
  }),
}));

vi.mock('@/lib/documentTotals', () => ({
  computeDocumentTotals: vi.fn(() => ({
    grossSubtotal: 0,
    netSubtotal: 0,
    grandTotal: 0,
    discountAmt: 0,
    taxAmt: 0,
    totalDiscountAmt: 0,
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

import {
  sortDocumentLines,
  buildCompanyFields,
  buildDocumentPdfLabels,
  computeDiscountBreakdown,
  resolveProductCode,
} from '../documentPdf.js';

// ── sortDocumentLines ─────────────────────────────────────────────────────────

describe('sortDocumentLines', () => {
  it('sorts lines ascending by lineNo (numeric)', () => {
    const input = [
      { lineNo: 30, product: 'C' },
      { lineNo: 10, product: 'A' },
      { lineNo: 20, product: 'B' },
    ];
    const result = sortDocumentLines(input);
    expect(result.map((l) => l.lineNo)).toEqual([10, 20, 30]);
  });

  it('does not mutate the original array', () => {
    const input = [{ lineNo: 20 }, { lineNo: 10 }];
    sortDocumentLines(input);
    expect(input[0].lineNo).toBe(20);
  });

  it('handles string lineNo values by numeric coercion', () => {
    const input = [{ lineNo: '30' }, { lineNo: '10' }, { lineNo: '20' }];
    const result = sortDocumentLines(input);
    expect(result.map((l) => l.lineNo)).toEqual(['10', '20', '30']);
  });

  it('handles missing lineNo (treats as 0) and sorts them first', () => {
    const input = [{ lineNo: 10 }, { lineNo: undefined }, { lineNo: 5 }];
    const result = sortDocumentLines(input);
    expect(result[0].lineNo).toBeUndefined();
    expect(result[1].lineNo).toBe(5);
    expect(result[2].lineNo).toBe(10);
  });

  it('returns an empty array when given an empty array', () => {
    expect(sortDocumentLines([])).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    const input = [{ lineNo: 1, name: 'only' }];
    const result = sortDocumentLines(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('only');
  });
});

// ── buildDocumentPdfLabels ────────────────────────────────────────────────────

describe('buildDocumentPdfLabels', () => {
  // Simple key-passthrough mock (same as useUI() convention)
  const ui = (key) => key;

  it('returns an object with all 20 common keys', () => {
    const labels = buildDocumentPdfLabels(ui, {});
    expect(labels).toHaveProperty('taxId', 'invoicePdfTaxId');
    expect(labels).toHaveProperty('page', 'invoicePdfPage');
    expect(labels).toHaveProperty('customerSection', 'invoicePdfCustomerSection');
    expect(labels).toHaveProperty('customer', 'invoicePdfCustomer');
    expect(labels).toHaveProperty('address', 'invoicePdfAddress');
    expect(labels).toHaveProperty('paymentTerms', 'invoicePdfPaymentTerms');
    expect(labels).toHaveProperty('paymentMethod', 'invoicePdfPaymentMethod');
    expect(labels).toHaveProperty('colCode', 'invoicePdfColCode');
    expect(labels).toHaveProperty('colDescription', 'invoicePdfColDescription');
    expect(labels).toHaveProperty('colUnitPrice', 'invoicePdfColUnitPrice');
    expect(labels).toHaveProperty('colDiscount', 'invoicePdfColDiscount');
    expect(labels).toHaveProperty('colTax', 'invoicePdfColTax');
    expect(labels).toHaveProperty('colTotal', 'invoicePdfColTotal');
    expect(labels).toHaveProperty('subtotal', 'invoicePdfSubtotal');
    expect(labels).toHaveProperty('tax', 'invoicePdfTax');
    expect(labels).toHaveProperty('grandTotal', 'invoicePdfGrandTotal');
    expect(labels).toHaveProperty('notes', 'invoicePdfNotes');
    expect(labels).toHaveProperty('subtotalWithoutDiscount', 'subtotalWithoutDiscount');
    expect(labels).toHaveProperty('discountPerProduct', 'discountPerProduct');
    expect(labels).toHaveProperty('totalDiscount', 'totalDiscount');
  });

  it('overrides merge correctly — custom key takes precedence', () => {
    const overrides = { title: 'Sales Order', documentNo: 'Order No.' };
    const labels = buildDocumentPdfLabels(ui, overrides);
    expect(labels.title).toBe('Sales Order');
    expect(labels.documentNo).toBe('Order No.');
    // Base keys still present
    expect(labels.taxId).toBe('invoicePdfTaxId');
  });

  it('handles empty overrides object', () => {
    const labels = buildDocumentPdfLabels(ui, {});
    expect(Object.keys(labels).length).toBeGreaterThanOrEqual(20);
  });

  it('uses the ui function to transform each key', () => {
    const customUi = (key) => `TRANSLATED:${key}`;
    const labels = buildDocumentPdfLabels(customUi, {});
    expect(labels.taxId).toBe('TRANSLATED:invoicePdfTaxId');
    expect(labels.grandTotal).toBe('TRANSLATED:invoicePdfGrandTotal');
  });

  it('override can add entirely new keys', () => {
    const labels = buildDocumentPdfLabels(ui, { validUntil: 'Valid Until' });
    expect(labels.validUntil).toBe('Valid Until');
  });
});

// ── computeDiscountBreakdown ──────────────────────────────────────────────────

describe('computeDiscountBreakdown', () => {
  // getGrossLine: quantity * unitPrice (simplified)
  const getGrossLine = (l) => l.quantity * l.unitPrice;

  it('computes grossAmount as sum of getGrossLine(l) across all lines', () => {
    const lines = [
      { quantity: 2, unitPrice: 100, lineNetAmount: 180 },
      { quantity: 1, unitPrice: 50, lineNetAmount: 50 },
    ];
    const result = computeDiscountBreakdown(lines, 0, getGrossLine);
    expect(result.grossAmount).toBe(250); // 2*100 + 1*50
  });

  it('computes discountPerProduct as max(0, grossAmount - productNetAmount)', () => {
    const lines = [
      { quantity: 2, unitPrice: 100, lineNetAmount: 180 },
      { quantity: 1, unitPrice: 50, lineNetAmount: 50 },
    ];
    const result = computeDiscountBreakdown(lines, 0, getGrossLine);
    expect(result.discountPerProduct).toBe(20); // 250 - (180+50)
  });

  it('totalDiscountAmt is 0 when etgoTotalDiscount is 0', () => {
    const lines = [{ quantity: 1, unitPrice: 100, lineNetAmount: 100 }];
    const result = computeDiscountBreakdown(lines, 0, getGrossLine);
    expect(result.totalDiscountAmt).toBe(0);
  });

  it('computes totalDiscountAmt when etgoTotalDiscount > 0', () => {
    const lines = [{ quantity: 1, unitPrice: 100, lineNetAmount: 100 }];
    // productNetAmount = 100, etgoTotalDiscount = 10 → totalDiscountAmt = 100 * 10/100 = 10
    const result = computeDiscountBreakdown(lines, 10, getGrossLine);
    expect(result.totalDiscountAmt).toBe(10);
  });

  it('discountPerProduct is never negative (clamped to 0)', () => {
    // lineNetAmount > grossAmount would be unusual but guard is present
    const lines = [{ quantity: 1, unitPrice: 50, lineNetAmount: 100 }];
    const result = computeDiscountBreakdown(lines, 0, getGrossLine);
    expect(result.discountPerProduct).toBeGreaterThanOrEqual(0);
  });

  it('returns zero values for empty lines array', () => {
    const result = computeDiscountBreakdown([], 0, getGrossLine);
    expect(result.grossAmount).toBe(0);
    expect(result.productNetAmount).toBe(0);
    expect(result.discountPerProduct).toBe(0);
    expect(result.totalDiscountAmt).toBe(0);
  });

  it('returns all four expected keys', () => {
    const result = computeDiscountBreakdown([], 0, getGrossLine);
    expect(result).toHaveProperty('grossAmount');
    expect(result).toHaveProperty('productNetAmount');
    expect(result).toHaveProperty('discountPerProduct');
    expect(result).toHaveProperty('totalDiscountAmt');
  });
});

// ── buildCompanyFields ────────────────────────────────────────────────────────

describe('buildCompanyFields', () => {
  const session = {
    organization: {
      name: 'My Company',
      address1: '123 Main St',
      address2: 'Suite 100',
      cityLine: 'Barcelona, 08001',
      taxId: 'B-12345678',
    },
  };
  const header = {
    partnerAddress$_identifier: 'Customer Address Summary',
    organization$_identifier: 'Fallback Org',
  };
  const companyLogoDataUrl = 'data:image/png;base64,abc';
  const partnerLocation = { addressLine1: '456 Oak Ave', city: 'Madrid' };

  it('returns all expected company keys', () => {
    const result = buildCompanyFields(session, header, companyLogoDataUrl, partnerLocation);
    expect(result).toHaveProperty('companyName');
    expect(result).toHaveProperty('companyAddress1');
    expect(result).toHaveProperty('companyAddress2');
    expect(result).toHaveProperty('companyCityLine');
    expect(result).toHaveProperty('companyTaxId');
    expect(result).toHaveProperty('companyLogoDataUrl');
    expect(result).toHaveProperty('hasCustomerAddress');
    expect(result).toHaveProperty('customerAddressLines');
  });

  it('uses session.organization fields when available', () => {
    const result = buildCompanyFields(session, header, companyLogoDataUrl, partnerLocation);
    expect(result.companyName).toBe('My Company');
    expect(result.companyAddress1).toBe('123 Main St');
    expect(result.companyTaxId).toBe('B-12345678');
  });

  it('falls back to header.organization$_identifier when session is null', () => {
    const result = buildCompanyFields(null, header, null, null);
    expect(result.companyName).toBe('Fallback Org');
  });

  it('falls back to "Empresa" when no org name is available', () => {
    const result = buildCompanyFields(null, {}, null, null);
    expect(result.companyName).toBe('Empresa');
  });

  it('passes the logo data URL through unchanged', () => {
    const result = buildCompanyFields(session, header, companyLogoDataUrl, partnerLocation);
    expect(result.companyLogoDataUrl).toBe(companyLogoDataUrl);
  });

  it('sets hasCustomerAddress=true when locationAddress returns lines', () => {
    // buildLocationAddressLines mock returns lines when addressLine1 is set
    const result = buildCompanyFields(session, header, null, partnerLocation);
    expect(result.hasCustomerAddress).toBe(true);
    expect(result.customerAddressLines.length).toBeGreaterThan(0);
  });

  it('sets hasCustomerAddress=false when no address is available', () => {
    const result = buildCompanyFields(session, { partnerAddress$_identifier: null }, null, null);
    // Mock returns [] when no addressLine1 and no fallback
    expect(result.hasCustomerAddress).toBe(false);
  });
});

// ── resolveProductCode (ETP-4941) ─────────────────────────────────────────────

describe('resolveProductCode', () => {
  it('returns line.productCode when present', () => {
    expect(resolveProductCode({ productCode: 'DIRECT-1', 'product$_value': 'SKU-1' })).toBe('DIRECT-1');
  });

  it('falls back to product$_value when productCode is absent', () => {
    expect(resolveProductCode({ 'product$_value': 'SKU-1' })).toBe('SKU-1');
  });

  it('falls back to "—" when neither productCode nor product$_value is present (product with no SKU)', () => {
    expect(resolveProductCode({})).toBe('—');
  });

  it('never falls back to a line number or index — that would reproduce the ETP-4941 bug', () => {
    const result = resolveProductCode({ lineNo: 3 });
    expect(result).toBe('—');
    expect(result).not.toBe('3');
    expect(result).not.toBe(3);
  });

  it('treats an empty-string productCode as absent and falls through the chain', () => {
    expect(resolveProductCode({ productCode: '', 'product$_value': 'SKU-2' })).toBe('SKU-2');
  });

  it('treats an empty-string product$_value (falsy but present, distinct from null/undefined) the same as absent — falls back to "—"', () => {
    expect(resolveProductCode({ 'product$_value': '' })).toBe('—');
    expect(resolveProductCode({ productCode: '', 'product$_value': '' })).toBe('—');
  });

  it('resolves multiple lines independently — no shared/leaked state across calls', () => {
    const lineA = { productCode: 'A-1' };
    const lineB = {}; // no SKU at all
    const lineC = { 'product$_value': 'C-3' };
    expect(resolveProductCode(lineA)).toBe('A-1');
    expect(resolveProductCode(lineB)).toBe('—');
    expect(resolveProductCode(lineC)).toBe('C-3');
    // Re-resolving in a different order must yield the same results (pure function).
    expect(resolveProductCode(lineC)).toBe('C-3');
    expect(resolveProductCode(lineB)).toBe('—');
    expect(resolveProductCode(lineA)).toBe('A-1');
  });
});
