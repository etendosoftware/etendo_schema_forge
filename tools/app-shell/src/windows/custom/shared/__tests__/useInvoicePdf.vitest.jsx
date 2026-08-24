// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../documentPdf.js', () => ({
  fetchJson: vi.fn(),
  fetchAll: vi.fn(),
  fetchOptionalJson: vi.fn(),
  fetchDocumentAssets: vi.fn(() => Promise.resolve({ companyLogoDataUrl: null, partnerLocation: null })),
  sortDocumentLines: vi.fn((lines) => [...lines]),
  buildCompanyFields: vi.fn(() => ({
    companyName: 'Test Co',
    companyAddress1: null,
    companyAddress2: null,
    companyCityLine: null,
    companyTaxId: null,
    companyLogoDataUrl: null,
    hasCustomerAddress: false,
    customerAddressLines: [],
  })),
  buildDocumentPdfLabels: vi.fn((ui, overrides) => ({ ...overrides, taxId: 'invoicePdfTaxId' })),
  computeDiscountBreakdown: vi.fn(() => ({
    grossAmount: 0,
    discountPerProduct: 0,
    totalDiscountAmt: 0,
    productNetAmount: 0,
  })),
  useDocumentPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

import { renderHook } from '@testing-library/react';
import { useInvoicePdf } from '../useInvoicePdf.js';
import { buildDocumentPdfLabels, useDocumentPdf } from '../documentPdf.js';

describe('useInvoicePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    buildDocumentPdfLabels.mockImplementation((ui, overrides) => ({ ...overrides, taxId: 'invoicePdfTaxId' }));
  });

  it('calls useDocumentPdf with the passed invoiceId, apiBaseUrl, and token', () => {
    renderHook(() => useInvoicePdf('inv-1', '/api', 'tok'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      'inv-1',
      '/api',
      'tok',
      expect.any(Function),
      expect.any(Object),
      null,
    );
  });

  it('calls buildDocumentPdfLabels with invoice-specific i18n keys', () => {
    renderHook(() => useInvoicePdf('inv-1', '/api', 'tok'));
    expect(buildDocumentPdfLabels).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        title: 'invoicePdfTitle',
        documentNo: 'invoicePdfDocumentNo',
        documentSection: 'invoicePdfInvoiceSection',
        date: 'invoicePdfDate',
        colQty: 'invoicePdfColQty',
      }),
    );
  });

  it('returns the result of useDocumentPdf', () => {
    useDocumentPdf.mockReturnValue({ pdfUrl: 'blob:inv-test', pdfBlob: new Blob(), loading: false, error: null });
    const { result } = renderHook(() => useInvoicePdf('inv-1', '/api', 'tok'));
    expect(result.current.pdfUrl).toBe('blob:inv-test');
    expect(result.current.pdfBlob).toBeInstanceOf(Blob);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('passes null invoiceId through to useDocumentPdf when invoiceId is null', () => {
    renderHook(() => useInvoicePdf(null, '/api', 'tok'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      null,
      '/api',
      'tok',
      expect.any(Function),
      expect.any(Object),
      null,
    );
  });
});
