// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const mockRenderPdf = vi.fn(() => Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })));
const mockRenderHtml = vi.fn(() => Promise.resolve('<html></html>'));
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
    renderHtml: (...args) => mockRenderHtml(...args),
  };
});

import { renderHook, waitFor } from '@testing-library/react';
import {
  useReturnReceiptPdf,
  getReturnReceiptPdfLabels,
  generateReturnReceiptPdf,
  generateReturnReceiptHtml,
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

// ── ETP-5124 regression: print-registry entry functions ────────────────────────
//
// `documentPdfRegistry.js` calls generateReturnReceiptPdf/Html directly — never
// through useReturnReceiptPdf/renderHook — for the Print button, the list-view
// multi-select print, and list-view email. A prior version of this suite only
// exercised the hook, so a `HELPERS is not defined` ReferenceError inside these
// two standalone functions (they referenced a bare `HELPERS` instead of the
// imported `RETURN_DOC_HELPERS`) shipped unnoticed until it broke Print in
// production. These tests call the functions directly to close that gap.
describe('generateReturnReceiptPdf / generateReturnReceiptHtml (print-registry entry points)', () => {
  const labels = getReturnReceiptPdfLabels((key) => key);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockResolvedValue(HEADER_STUB);
    mockFetchAll.mockResolvedValue([]);
    mockFetchOptionalJson.mockResolvedValue(null);
    mockFetchLocationAddress.mockResolvedValue(null);
    mockFetchImageDataUrl.mockResolvedValue(null);
    mockBuildLocationAddressLines.mockReturnValue([]);
    mockRenderPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    mockRenderHtml.mockResolvedValue('<html></html>');
  });

  it('generateReturnReceiptPdf does not throw ReferenceError calling the print-registry entry function directly', async () => {
    await expect(
      generateReturnReceiptPdf('rmr-1', '/api/return-material-receipt', 'tok', labels),
    ).resolves.toBeInstanceOf(Blob);
  });

  it('generateReturnReceiptPdf resolves with the PDF blob returned by renderPdf', async () => {
    const pdf = await generateReturnReceiptPdf('rmr-1', '/api/return-material-receipt', 'tok', labels);
    expect(pdf).toBeInstanceOf(Blob);
    expect(pdf.type).toBe('application/pdf');
  });

  it('generateReturnReceiptPdf calls renderPdf with the shared RETURN_DOC_HELPERS (not an undefined HELPERS)', async () => {
    await generateReturnReceiptPdf('rmr-1', '/api/return-material-receipt', 'tok', labels);
    expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    const [, , helpers, data] = mockRenderPdf.mock.calls[0];
    expect(helpers).toBe(''); // mocked RETURN_DOC_HELPERS value — proves the real export was passed through, not a bare `HELPERS` identifier
    expect(data.labels).toBe(labels);
  });

  it('generateReturnReceiptHtml does not throw ReferenceError calling the print-registry entry function directly', async () => {
    await expect(
      generateReturnReceiptHtml('rmr-1', '/api/return-material-receipt', 'tok', labels),
    ).resolves.toEqual(expect.any(String));
  });

  it('generateReturnReceiptHtml resolves with the HTML string returned by renderHtml', async () => {
    const html = await generateReturnReceiptHtml('rmr-1', '/api/return-material-receipt', 'tok', labels);
    expect(html).toBe('<html></html>');
  });

  it('generateReturnReceiptHtml calls renderHtml with the shared RETURN_DOC_HELPERS (not an undefined HELPERS)', async () => {
    await generateReturnReceiptHtml('rmr-1', '/api/return-material-receipt', 'tok', labels);
    expect(mockRenderHtml).toHaveBeenCalledTimes(1);
    const [, , helpers, data] = mockRenderHtml.mock.calls[0];
    expect(helpers).toBe('');
    expect(data.labels).toBe(labels);
  });
});
