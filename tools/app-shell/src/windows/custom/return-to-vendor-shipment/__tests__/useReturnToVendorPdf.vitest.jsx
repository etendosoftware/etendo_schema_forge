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
    RETURN_DOC_HELPERS: '',
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
import {
  useReturnToVendorPdf,
  getReturnToVendorPdfLabels,
  generateReturnToVendorPdf,
} from '../useReturnToVendorPdf.js';

const HEADER_STUB = {
  documentNo: 'RTV-001',
  movementDate: '2025-03-10',
  'businessPartner$_identifier': 'Vendor A',
  issuerOrg: { name: 'My Company' },
};

// ── getReturnToVendorPdfLabels ────────────────────────────────────────────────

describe('getReturnToVendorPdfLabels', () => {
  const ui = (key) => key;

  it('returns an object with all expected label keys', () => {
    const labels = getReturnToVendorPdfLabels(ui);
    expect(labels).toHaveProperty('title', 'returnToVendorPdfTitle');
    expect(labels).toHaveProperty('taxId', 'invoicePdfTaxId');
    expect(labels).toHaveProperty('page', 'invoicePdfPage');
    expect(labels).toHaveProperty('issuerSection', 'shipmentPdfIssuerSection');
    expect(labels).toHaveProperty('vendorSection', 'returnToVendorPdfVendorSection');
    expect(labels).toHaveProperty('sourceReceipt', 'returnToVendorPdfSourceReceipt');
    expect(labels).toHaveProperty('date', 'shipmentPdfDate');
    expect(labels).toHaveProperty('warehouse', 'shipmentPdfWarehouse');
    expect(labels).toHaveProperty('colCode', 'invoicePdfColCode');
    expect(labels).toHaveProperty('colDescription', 'invoicePdfColDescription');
    expect(labels).toHaveProperty('colReturned', 'returnToVendorPdfColReturned');
    expect(labels).toHaveProperty('colOriginalQty', 'returnToVendorPdfColOriginalQty');
    expect(labels).toHaveProperty('notes', 'invoicePdfNotes');
  });

  it('each value is a string when ui is a passthrough', () => {
    const labels = getReturnToVendorPdfLabels(ui);
    for (const value of Object.values(labels)) {
      expect(typeof value).toBe('string');
    }
  });

  it('maps values through the provided ui translator', () => {
    const t = (key) => `[${key}]`;
    const labels = getReturnToVendorPdfLabels(t);
    expect(labels.title).toBe('[returnToVendorPdfTitle]');
  });
});

// ── useReturnToVendorPdf ──────────────────────────────────────────────────────

describe('useReturnToVendorPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockResolvedValue(HEADER_STUB);
    mockFetchAll.mockResolvedValue([]);
    mockFetchOptionalJson.mockResolvedValue(null);
    mockFetchLocationAddress.mockResolvedValue(null);
    mockFetchImageDataUrl.mockResolvedValue(null);
    mockBuildLocationAddressLines.mockReturnValue([]);
    mockRenderPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  });

  it('returns initial state with nulls and loading false when shipmentId is null', () => {
    const { result } = renderHook(() => useReturnToVendorPdf(null, '/api/return-to-vendor', 'tok'));
    expect(result.current.pdfUrl).toBeNull();
    expect(result.current.pdfBlob).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets loading to true immediately when shipmentId is provided', () => {
    const { result } = renderHook(() =>
      useReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok'),
    );
    expect(result.current.loading).toBe(true);
  });

  it('resolves pdfBlob and pdfUrl after async completes', async () => {
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    global.URL.revokeObjectURL = vi.fn();

    const { result } = renderHook(() =>
      useReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pdfBlob).toBeInstanceOf(Blob);
    expect(result.current.pdfUrl).toBe('blob:http://localhost/test');
  });
});

// ── generateReturnToVendorPdf ─────────────────────────────────────────────────

describe('generateReturnToVendorPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockResolvedValue(HEADER_STUB);
    mockFetchAll.mockResolvedValue([]);
    mockFetchOptionalJson.mockResolvedValue(null);
    mockFetchLocationAddress.mockResolvedValue(null);
    mockFetchImageDataUrl.mockResolvedValue(null);
    mockBuildLocationAddressLines.mockReturnValue([]);
    mockRenderPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  });

  it('calls renderPdf and returns a Blob', async () => {
    const labels = getReturnToVendorPdfLabels((k) => k);
    const blob = await generateReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok', labels);
    expect(mockRenderPdf).toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
  });

  it('passes data fields to renderPdf', async () => {
    const labels = getReturnToVendorPdfLabels((k) => k);
    await generateReturnToVendorPdf('rtv-1', '/api/return-to-vendor-shipment', 'tok', labels);
    const [, , , data] = mockRenderPdf.mock.calls[0];
    expect(data).toHaveProperty('documentNo', 'RTV-001');
    expect(data).toHaveProperty('labels');
  });
});
