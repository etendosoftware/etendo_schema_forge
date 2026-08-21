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
  buildCompanyFields: vi.fn(() => ({})),
  buildDocumentPdfLabels: vi.fn((ui, overrides) => ({ ...overrides, taxId: 'invoicePdfTaxId' })),
  computeDiscountBreakdown: vi.fn(() => ({ grossAmount: 0, discountPerProduct: 0, totalDiscountAmt: 0, productNetAmount: 0 })),
  useDocumentPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

import { renderHook } from '@testing-library/react';
import { useQuotationPdf } from '../useQuotationPdf.js';
import { buildDocumentPdfLabels, useDocumentPdf } from '../documentPdf.js';

describe('useQuotationPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    buildDocumentPdfLabels.mockImplementation((ui, overrides) => ({ ...overrides, taxId: 'invoicePdfTaxId' }));
  });

  it('calls useDocumentPdf with the passed quotationId, apiBaseUrl, and token', () => {
    renderHook(() => useQuotationPdf('q-1', '/api', 'tok'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      'q-1',
      '/api',
      'tok',
      expect.any(Function),
      expect.any(Object),
      null,
    );
  });

  it('calls buildDocumentPdfLabels with quotation-specific i18n keys', () => {
    renderHook(() => useQuotationPdf('q-1', '/api', 'tok'));
    expect(buildDocumentPdfLabels).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        title: 'quotationPdfTitle',
        documentNo: 'quotationPdfDocumentNo',
        documentSection: 'quotationPdfSection',
        date: 'quotationPdfDate',
        colQty: 'quotationPdfColQty',
      }),
    );
  });

  it('includes validUntil label in the overrides passed to buildDocumentPdfLabels', () => {
    renderHook(() => useQuotationPdf('q-1', '/api', 'tok'));
    expect(buildDocumentPdfLabels).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        validUntil: 'quotationPdfValidUntil',
      }),
    );
  });

  it('returns the result of useDocumentPdf', () => {
    useDocumentPdf.mockReturnValue({ pdfUrl: 'blob:q-test', pdfBlob: new Blob(), loading: false, error: null });
    const { result } = renderHook(() => useQuotationPdf('q-1', '/api', 'tok'));
    expect(result.current.pdfUrl).toBe('blob:q-test');
    expect(result.current.pdfBlob).toBeInstanceOf(Blob);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('passes null quotationId through to useDocumentPdf when quotationId is null', () => {
    renderHook(() => useQuotationPdf(null, '/api', 'tok'));
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
