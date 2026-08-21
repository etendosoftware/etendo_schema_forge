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
import { useOrderPdf } from '../useOrderPdf.js';
import { buildDocumentPdfLabels, useDocumentPdf } from '../documentPdf.js';

describe('useOrderPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    buildDocumentPdfLabels.mockImplementation((ui, overrides) => ({ ...overrides, taxId: 'invoicePdfTaxId' }));
  });

  it('calls useDocumentPdf with the passed orderId and apiBaseUrl', () => {
    renderHook(() => useOrderPdf('order-1', '/api'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      'order-1',
      '/api',
      expect.any(Function),
      expect.any(Object),
      null,
    );
  });

  it('calls buildDocumentPdfLabels with i18n keys for order PDF labels', () => {
    renderHook(() => useOrderPdf('order-1', '/api'));
    expect(buildDocumentPdfLabels).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        title: 'orderPdfTitle',
        documentNo: 'orderPdfDocumentNo',
        documentSection: 'orderPdfSection',
        date: 'orderPdfDate',
        colQty: 'orderPdfColQty',
      }),
    );
  });

  it('returns the result of useDocumentPdf', () => {
    useDocumentPdf.mockReturnValue({ pdfUrl: 'blob:test', pdfBlob: new Blob(), loading: false, error: null });
    const { result } = renderHook(() => useOrderPdf('order-1', '/api'));
    expect(result.current.pdfUrl).toBe('blob:test');
    expect(result.current.pdfBlob).toBeInstanceOf(Blob);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('passes null orderId through to useDocumentPdf when orderId is null', () => {
    renderHook(() => useOrderPdf(null, '/api'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      null,
      '/api',
      expect.any(Function),
      expect.any(Object),
      null,
    );
  });
});
