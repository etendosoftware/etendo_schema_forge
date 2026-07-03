// Mocks must come before imports (Vitest hoisting).
// Mirrors shared/usePurchaseOrderPdf.vitest.jsx but scoped to the
// return-to-vendor spec so buildOrderData is invoked with 'return-to-vendor'.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../../shared/documentPdf.js', () => ({
  buildOrderData: vi.fn(),
  buildDocumentPdfLabels: vi.fn((ui, overrides) => ({ ...overrides })),
  useDocumentPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

import { renderHook } from '@testing-library/react';
import { useReturnToVendorOrderPdf } from '../useReturnToVendorOrderPdf.js';
import { buildOrderData, buildDocumentPdfLabels, useDocumentPdf } from '../../shared/documentPdf.js';

describe('useReturnToVendorOrderPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    buildDocumentPdfLabels.mockImplementation((ui, overrides) => ({ ...overrides }));
  });

  it('calls useDocumentPdf with the passed orderId, apiBaseUrl, and token', () => {
    renderHook(() => useReturnToVendorOrderPdf('rtv-1', '/api', 'tok'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      'rtv-1',
      '/api',
      'tok',
      expect.any(Function),
      expect.any(Object),
    );
  });

  it('calls buildDocumentPdfLabels with return-to-vendor-specific i18n keys', () => {
    renderHook(() => useReturnToVendorOrderPdf('rtv-1', '/api', 'tok'));
    expect(buildDocumentPdfLabels).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        title: 'returnToVendorPdfTitle',
        documentNo: 'purchaseOrderPdfDocumentNo',
        documentSection: 'purchaseOrderPdfSection',
        date: 'orderPdfDate',
        colQty: 'orderPdfColQty',
      }),
    );
  });

  it('the builder passed to useDocumentPdf invokes buildOrderData with the return-to-vendor spec', () => {
    renderHook(() => useReturnToVendorOrderPdf('rtv-1', '/api', 'tok'));
    // The 4th arg to useDocumentPdf is the memoized builder callback.
    const builder = useDocumentPdf.mock.calls[0][3];
    builder('rec-9', '/api', 'tok');
    expect(buildOrderData).toHaveBeenCalledWith('return-to-vendor', 'rec-9', '/api', 'tok', null);
  });

  it('forwards currencyData into buildOrderData when provided', () => {
    const currencyData = { exchangeRate: 1.2, orgCurrencyCode: 'USD' };
    renderHook(() => useReturnToVendorOrderPdf('rtv-1', '/api', 'tok', currencyData));
    const builder = useDocumentPdf.mock.calls[0][3];
    builder('rec-9', '/api', 'tok');
    expect(buildOrderData).toHaveBeenCalledWith('return-to-vendor', 'rec-9', '/api', 'tok', currencyData);
  });

  it('returns the result of useDocumentPdf', () => {
    useDocumentPdf.mockReturnValue({ pdfUrl: 'blob:rtv-test', pdfBlob: new Blob(), loading: false, error: null });
    const { result } = renderHook(() => useReturnToVendorOrderPdf('rtv-1', '/api', 'tok'));
    expect(result.current.pdfUrl).toBe('blob:rtv-test');
    expect(result.current.pdfBlob).toBeInstanceOf(Blob);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('passes null orderId through when orderId is null', () => {
    renderHook(() => useReturnToVendorOrderPdf(null, '/api', 'tok'));
    expect(useDocumentPdf).toHaveBeenCalledWith(
      null,
      '/api',
      'tok',
      expect.any(Function),
      expect.any(Object),
    );
  });
});
