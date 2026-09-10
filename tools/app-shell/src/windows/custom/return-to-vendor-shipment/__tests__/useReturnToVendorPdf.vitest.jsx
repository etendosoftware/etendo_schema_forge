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
  useReturnToVendorPdf,
  getReturnToVendorPdfLabels,
  generateReturnToVendorPdf,
  generateReturnToVendorHtml,
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
    expect(labels).toHaveProperty('deliverySection', 'shipmentPdfDeliverySection');
    expect(labels).toHaveProperty('sourceReceipt', 'returnToVendorPdfSourceReceipt');
    expect(labels).toHaveProperty('date', 'shipmentPdfDate');
    expect(labels).toHaveProperty('warehouse', 'shipmentPdfWarehouse');
    expect(labels).toHaveProperty('colCode', 'invoicePdfColCode');
    expect(labels).toHaveProperty('colDescription', 'invoicePdfColDescription');
    expect(labels).toHaveProperty('colReturned', 'returnToVendorPdfColReturned');
    expect(labels).toHaveProperty('colOriginalQty', 'returnToVendorPdfColOriginalQty');
    expect(labels).toHaveProperty('notes', 'invoicePdfNotes');
    // ETP-4939 — the shared MOVEMENT_TEMPLATE_SIGNATURE fragment (which the
    // template must compose, see below) reads these two label keys.
    expect(labels).toHaveProperty('signatureReceiver', 'shipmentPdfSignatureReceiver');
    expect(labels).toHaveProperty('signatureDate', 'shipmentPdfSignatureDate');
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

  // ETP-4939 — pre-ETP-4034 regression: the label used to be named `signatureIssuer`
  // and pointed at the wrong placeholder. It must stay named `signatureReceiver`,
  // matching the sibling hooks (useShipmentPdf, useReturnReceiptPdf) and the
  // {{labels.signatureReceiver}} placeholder in MOVEMENT_TEMPLATE_SIGNATURE.
  it('does NOT resurrect the legacy signatureIssuer key', () => {
    const labels = getReturnToVendorPdfLabels(ui);
    expect(labels).not.toHaveProperty('signatureIssuer');
    expect(labels).toHaveProperty('signatureReceiver');
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

// ── ETP-4939 regression: DESTINATARIO card must resolve (bug 2) ────────────────
//
// MOVEMENT_TEMPLATE_PARTIES (the shared fragment every movement-doc hook composes
// into its TEMPLATE) only ever reads `{{customerName}}` / `{{#each customerAddressLines}}`
// for the DESTINATARIO card. buildReturnToVendorData currently emits `vendorName` /
// `vendorAddressLines` instead — names the shared template never reads — so the
// card renders empty. These assertions inspect the actual `data` object handed to
// renderPdf (mockRenderPdf.mock.calls[0]), not just the label strings, which is the
// gap the previous version of this suite left open.
describe('useReturnToVendorPdf — data passed to the shared parties template (bug 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockResolvedValue(HEADER_STUB);
    mockFetchAll.mockResolvedValue([]);
    mockFetchOptionalJson.mockResolvedValue(null);
    mockFetchLocationAddress.mockResolvedValue(null);
    mockFetchImageDataUrl.mockResolvedValue(null);
    mockBuildLocationAddressLines.mockReturnValue(['Calle Falsa 123', '28080 Madrid']);
    mockRenderPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    global.URL.revokeObjectURL = vi.fn();
  });

  async function renderAndGetRenderPdfData() {
    const { result } = renderHook(() =>
      useReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    // renderPdf(content, css, helpers, data)
    return mockRenderPdf.mock.calls[0];
  }

  it('populates data.customerName from the vendor business-partner identifier', async () => {
    const [, , , data] = await renderAndGetRenderPdfData();
    expect(data.customerName).toBe('Vendor A');
  });

  it('populates data.customerAddressLines from the vendor location', async () => {
    const [, , , data] = await renderAndGetRenderPdfData();
    expect(data.customerAddressLines).toEqual(['Calle Falsa 123', '28080 Madrid']);
  });

  it('does NOT emit vendorName / vendorAddressLines (the shared template never reads them)', async () => {
    const [, , , data] = await renderAndGetRenderPdfData();
    expect(data).not.toHaveProperty('vendorName');
    expect(data).not.toHaveProperty('vendorAddressLines');
  });

  it('includes labels.deliverySection so the DESTINATARIO card eyebrow renders', async () => {
    const [, , , data] = await renderAndGetRenderPdfData();
    expect(data.labels).toHaveProperty('deliverySection', 'shipmentPdfDeliverySection');
  });
});

// ── ETP-4939 regression: signature section missing from the template (bug 1) ──
//
// The signature fragment was dropped in a pre-ETP-4034 commit; the sibling hooks
// (useShipmentPdf, useReturnReceiptPdf) both compose MOVEMENT_TEMPLATE_SIGNATURE
// into their TEMPLATE, this one does not. Inspect the actual `content` string
// handed to renderPdf — the compiled TEMPLATE — rather than trusting that a label
// existing means it is used somewhere.
describe('useReturnToVendorPdf — TEMPLATE must compose the shared signature fragment (bug 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockResolvedValue(HEADER_STUB);
    mockFetchAll.mockResolvedValue([]);
    mockFetchOptionalJson.mockResolvedValue(null);
    mockFetchLocationAddress.mockResolvedValue(null);
    mockFetchImageDataUrl.mockResolvedValue(null);
    mockBuildLocationAddressLines.mockReturnValue([]);
    mockRenderPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('the rendered content includes the doc-signature block', async () => {
    const { result } = renderHook(() =>
      useReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const [content] = mockRenderPdf.mock.calls[0];
    expect(content).toContain('doc-signature');
  });

  it('the rendered content references {{labels.signatureReceiver}}', async () => {
    const { result } = renderHook(() =>
      useReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const [content] = mockRenderPdf.mock.calls[0];
    expect(content).toContain('{{labels.signatureReceiver}}');
  });

  it('the rendered content references {{labels.signatureDate}}', async () => {
    const { result } = renderHook(() =>
      useReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const [content] = mockRenderPdf.mock.calls[0];
    expect(content).toContain('{{labels.signatureDate}}');
  });
});

// ── ETP-5124 regression: print-registry entry functions ────────────────────────
//
// `documentPdfRegistry.js` calls generateReturnToVendorPdf/Html directly — never
// through useReturnToVendorPdf/renderHook — for the Print button, the list-view
// multi-select print, and list-view email. A prior version of this suite only
// exercised the hook, so a `HELPERS is not defined` ReferenceError inside these
// two standalone functions (they referenced a bare `HELPERS` instead of the
// imported `RETURN_DOC_HELPERS`) shipped unnoticed until it broke Print in
// production. These tests call the functions directly to close that gap.
describe('generateReturnToVendorPdf / generateReturnToVendorHtml (print-registry entry points)', () => {
  const labels = getReturnToVendorPdfLabels((key) => key);

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

  it('generateReturnToVendorPdf does not throw ReferenceError calling the print-registry entry function directly', async () => {
    await expect(
      generateReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok', labels),
    ).resolves.toBeInstanceOf(Blob);
  });

  it('generateReturnToVendorPdf resolves with the PDF blob returned by renderPdf', async () => {
    const pdf = await generateReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok', labels);
    expect(pdf).toBeInstanceOf(Blob);
    expect(pdf.type).toBe('application/pdf');
  });

  it('generateReturnToVendorPdf calls renderPdf with the shared RETURN_DOC_HELPERS (not an undefined HELPERS)', async () => {
    await generateReturnToVendorPdf('rtv-1', '/api/return-to-vendor', 'tok', labels);
    expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    const [, , helpers, data] = mockRenderPdf.mock.calls[0];
    expect(helpers).toBe(''); // mocked RETURN_DOC_HELPERS value — proves the real export was passed through, not a bare `HELPERS` identifier
    expect(data.labels).toBe(labels);
  });

  it('generateReturnToVendorHtml does not throw ReferenceError calling the print-registry entry function directly', async () => {
    await expect(
      generateReturnToVendorHtml('rtv-1', '/api/return-to-vendor', 'tok', labels),
    ).resolves.toEqual(expect.any(String));
  });

  it('generateReturnToVendorHtml resolves with the HTML string returned by renderHtml', async () => {
    const html = await generateReturnToVendorHtml('rtv-1', '/api/return-to-vendor', 'tok', labels);
    expect(html).toBe('<html></html>');
  });

  it('generateReturnToVendorHtml calls renderHtml with the shared RETURN_DOC_HELPERS (not an undefined HELPERS)', async () => {
    await generateReturnToVendorHtml('rtv-1', '/api/return-to-vendor', 'tok', labels);
    expect(mockRenderHtml).toHaveBeenCalledTimes(1);
    const [, , helpers, data] = mockRenderHtml.mock.calls[0];
    expect(helpers).toBe('');
    expect(data.labels).toBe(labels);
  });
});
