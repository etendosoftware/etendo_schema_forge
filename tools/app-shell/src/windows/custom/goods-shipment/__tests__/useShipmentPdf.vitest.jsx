// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const mockRenderPdf = vi.fn(() => Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })));
const mockFetchJson = vi.fn();
const mockFetchAll = vi.fn();
const mockFetchOptionalJson = vi.fn();
const mockFetchLocationAddress = vi.fn(() => Promise.resolve(null));
const mockFetchImageDataUrl = vi.fn(() => Promise.resolve(null));
const mockBuildLocationAddressLines = vi.fn(() => []);

vi.mock('../../shared/pdfUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    COMMON_HANDLEBARS_HELPERS: '',
    COMMON_PDF_CSS: '',
    fetchJson: (...args) => mockFetchJson(...args),
    fetchAll: (...args) => mockFetchAll(...args),
    fetchOptionalJson: (...args) => mockFetchOptionalJson(...args),
    fetchLocationAddress: (...args) => mockFetchLocationAddress(...args),
    fetchImageDataUrl: (...args) => mockFetchImageDataUrl(...args),
    buildLocationAddressLines: (...args) => mockBuildLocationAddressLines(...args),
    renderPdf: (...args) => mockRenderPdf(...args),
  };
});

import { renderHook, waitFor } from '@testing-library/react';
import { useShipmentPdf, getShipmentPdfLabels, generateShipmentPdf } from '../useShipmentPdf.js';

// ── getShipmentPdfLabels ──────────────────────────────────────────────────────

describe('getShipmentPdfLabels', () => {
  const ui = (key) => key;

  it('returns an object with all expected label keys', () => {
    const labels = getShipmentPdfLabels(ui);
    expect(labels).toHaveProperty('title', 'shipmentPdfTitle');
    expect(labels).toHaveProperty('taxId', 'invoicePdfTaxId');
    expect(labels).toHaveProperty('page', 'invoicePdfPage');
    expect(labels).toHaveProperty('issuerSection', 'shipmentPdfIssuerSection');
    expect(labels).toHaveProperty('deliverySection', 'shipmentPdfDeliverySection');
    expect(labels).toHaveProperty('salesOrder', 'shipmentPdfSalesOrder');
    expect(labels).toHaveProperty('date', 'shipmentPdfDate');
    expect(labels).toHaveProperty('warehouse', 'shipmentPdfWarehouse');
    expect(labels).toHaveProperty('colCode', 'invoicePdfColCode');
    expect(labels).toHaveProperty('colDescription', 'invoicePdfColDescription');
    expect(labels).toHaveProperty('colOrdered', 'shipmentPdfColOrdered');
    expect(labels).toHaveProperty('colDelivered', 'shipmentPdfColDelivered');
    expect(labels).toHaveProperty('notes', 'invoicePdfNotes');
    expect(labels).toHaveProperty('signatureReceiver', 'shipmentPdfSignatureReceiver');
    expect(labels).toHaveProperty('signatureDate', 'shipmentPdfSignatureDate');
  });

  it('each value is the i18n key string when ui is a passthrough', () => {
    const labels = getShipmentPdfLabels(ui);
    for (const [, value] of Object.entries(labels)) {
      expect(typeof value).toBe('string');
    }
  });
});

// ── useShipmentPdf ────────────────────────────────────────────────────────────

describe('useShipmentPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockResolvedValue({
      documentNo: 'ALB-001',
      movementDate: '2024-01-01',
      'businessPartner$_identifier': 'Client A',
      issuerOrg: { name: 'My Company' },
    });
    mockFetchAll.mockResolvedValue([]);
    mockFetchOptionalJson.mockResolvedValue(null);
    mockFetchLocationAddress.mockResolvedValue(null);
    mockFetchImageDataUrl.mockResolvedValue(null);
    mockBuildLocationAddressLines.mockReturnValue([]);
    mockRenderPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  });

  it('returns initial state with all nulls and loading false when shipmentId is null', () => {
    const { result } = renderHook(() => useShipmentPdf(null, '/api/goods-shipment', 'tok'));
    expect(result.current.pdfUrl).toBeNull();
    expect(result.current.pdfBlob).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not start loading when shipmentId is null', () => {
    const { result } = renderHook(() => useShipmentPdf(null, '/api/goods-shipment', 'tok'));
    expect(result.current.loading).toBe(false);
  });

  it('sets loading to true immediately when shipmentId is provided', () => {
    const { result } = renderHook(() =>
      useShipmentPdf('ship-1', '/api/goods-shipment', 'tok'),
    );
    expect(result.current.loading).toBe(true);
  });

  it('resolves pdfBlob and pdfUrl after async completes', async () => {
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    global.URL.revokeObjectURL = vi.fn();

    const { result } = renderHook(() =>
      useShipmentPdf('ship-1', '/api/goods-shipment', 'tok'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pdfBlob).toBeInstanceOf(Blob);
    expect(result.current.pdfUrl).toBe('blob:http://localhost/test');
  });
});

// ── generateShipmentPdf ───────────────────────────────────────────────────────

describe('generateShipmentPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockResolvedValue({
      documentNo: 'ALB-001',
      movementDate: '2024-01-01',
      'businessPartner$_identifier': 'Client A',
      issuerOrg: { name: 'My Company' },
    });
    mockFetchAll.mockResolvedValue([]);
    mockFetchOptionalJson.mockResolvedValue(null);
    mockFetchLocationAddress.mockResolvedValue(null);
    mockFetchImageDataUrl.mockResolvedValue(null);
    mockBuildLocationAddressLines.mockReturnValue([]);
    mockRenderPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  });

  it('calls renderPdf and returns a Blob', async () => {
    const labels = { title: 'Delivery Note', taxId: 'NIF' };
    const blob = await generateShipmentPdf('ship-1', '/api/goods-shipment', 'tok', labels);
    expect(mockRenderPdf).toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
  });
});
