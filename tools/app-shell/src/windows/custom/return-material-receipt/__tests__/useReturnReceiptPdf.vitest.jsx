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
  useReturnReceiptPdf,
  getReturnReceiptPdfLabels,
  generateReturnReceiptPdf,
} from '../useReturnReceiptPdf.js';

const HEADER_STUB = {
  documentNo: 'RMR-001',
  movementDate: '2025-04-01',
  'businessPartner$_identifier': 'Supplier B',
  issuerOrg: { name: 'My Company' },
};

// ── getReturnReceiptPdfLabels ─────────────────────────────────────────────────

describe('getReturnReceiptPdfLabels', () => {
  const ui = (key) => key;

  it('returns an object with all expected label keys', () => {
    const labels = getReturnReceiptPdfLabels(ui);
    expect(labels).toHaveProperty('title', 'returnReceiptPdfTitle');
    expect(labels).toHaveProperty('taxId', 'invoicePdfTaxId');
    expect(labels).toHaveProperty('page', 'invoicePdfPage');
    expect(labels).toHaveProperty('issuerSection', 'shipmentPdfIssuerSection');
    expect(labels).toHaveProperty('deliverySection', 'shipmentPdfDeliverySection');
    expect(labels).toHaveProperty('sourceShipment', 'returnReceiptPdfSourceShipment');
    expect(labels).toHaveProperty('date', 'shipmentPdfDate');
    expect(labels).toHaveProperty('warehouse', 'shipmentPdfWarehouse');
    expect(labels).toHaveProperty('colCode', 'invoicePdfColCode');
    expect(labels).toHaveProperty('colDescription', 'invoicePdfColDescription');
    expect(labels).toHaveProperty('colReturned', 'returnReceiptPdfColReturned');
    expect(labels).toHaveProperty('notes', 'invoicePdfNotes');
    expect(labels).toHaveProperty('signatureReceiver', 'shipmentPdfSignatureReceiver');
    expect(labels).toHaveProperty('signatureDate', 'shipmentPdfSignatureDate');
  });

  it('each value is a string when ui is a passthrough', () => {
    const labels = getReturnReceiptPdfLabels(ui);
    for (const value of Object.values(labels)) {
      expect(typeof value).toBe('string');
    }
  });

  it('maps values through the provided ui translator', () => {
    const t = (key) => `[${key}]`;
    const labels = getReturnReceiptPdfLabels(t);
    expect(labels.title).toBe('[returnReceiptPdfTitle]');
  });
});

// ── useReturnReceiptPdf ───────────────────────────────────────────────────────

describe('useReturnReceiptPdf', () => {
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

  it('returns initial state with nulls and loading false when receiptId is null', () => {
    const { result } = renderHook(() => useReturnReceiptPdf(null, '/api/return-material-receipt', 'tok'));
    expect(result.current.pdfUrl).toBeNull();
    expect(result.current.pdfBlob).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets loading to true immediately when receiptId is provided', () => {
    const { result } = renderHook(() =>
      useReturnReceiptPdf('rmr-1', '/api/return-material-receipt', 'tok'),
    );
    expect(result.current.loading).toBe(true);
  });

  it('resolves pdfBlob and pdfUrl after async completes', async () => {
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    global.URL.revokeObjectURL = vi.fn();

    const { result } = renderHook(() =>
      useReturnReceiptPdf('rmr-1', '/api/return-material-receipt', 'tok'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pdfBlob).toBeInstanceOf(Blob);
    expect(result.current.pdfUrl).toBe('blob:http://localhost/test');
  });
});

// ── generateReturnReceiptPdf ──────────────────────────────────────────────────

describe('generateReturnReceiptPdf', () => {
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
    const labels = getReturnReceiptPdfLabels((k) => k);
    const blob = await generateReturnReceiptPdf('rmr-1', '/api/return-material-receipt', 'tok', labels);
    expect(mockRenderPdf).toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
  });

  it('passes data fields to renderPdf', async () => {
    const labels = getReturnReceiptPdfLabels((k) => k);
    await generateReturnReceiptPdf('rmr-1', '/api/return-material-receipt', 'tok', labels);
    const [, , , data] = mockRenderPdf.mock.calls[0];
    expect(data).toHaveProperty('documentNo', 'RMR-001');
    expect(data).toHaveProperty('labels');
  });
});
