// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../documentPdf.js', () => ({
  buildOrderData: vi.fn(),
  buildDocumentPdfLabels: vi.fn((ui, overrides) => ({ ...overrides, taxId: 'invoicePdfTaxId' })),
  useDocumentPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

import { renderHook } from '@testing-library/react';
import { usePurchaseOrderPdf } from '../usePurchaseOrderPdf.js';
import { buildDocumentPdfLabels, useDocumentPdf } from '../documentPdf.js';

describe('usePurchaseOrderPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    buildDocumentPdfLabels.mockImplementation((ui, overrides) => ({ ...overrides, taxId: 'invoicePdfTaxId' }));
  });

  it('calls useDocumentPdf with the passed orderId, apiBaseUrl, and token', () => {
    renderHook(() => usePurchaseOrderPdf('po-1', '/api', 'tok'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      'po-1',
      '/api',
      'tok',
      expect.any(Function),
      expect.any(Object),
      null,
    );
  });

  it('calls buildDocumentPdfLabels with purchase-order-specific i18n keys', () => {
    renderHook(() => usePurchaseOrderPdf('po-1', '/api', 'tok'));
    expect(buildDocumentPdfLabels).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        title: 'purchaseOrderPdfTitle',
        documentNo: 'purchaseOrderPdfDocumentNo',
        documentSection: 'purchaseOrderPdfSection',
        date: 'orderPdfDate',
        colQty: 'orderPdfColQty',
      }),
    );
  });

  it('returns the result of useDocumentPdf', () => {
    useDocumentPdf.mockReturnValue({ pdfUrl: 'blob:po-test', pdfBlob: new Blob(), loading: false, error: null });
    const { result } = renderHook(() => usePurchaseOrderPdf('po-1', '/api', 'tok'));
    expect(result.current.pdfUrl).toBe('blob:po-test');
    expect(result.current.pdfBlob).toBeInstanceOf(Blob);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('passes null orderId through to useDocumentPdf when orderId is null', () => {
    renderHook(() => usePurchaseOrderPdf(null, '/api', 'tok'));
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
