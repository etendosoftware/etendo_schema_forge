/**
 * ETP-5308 — SendDocumentModal's own fallback effect (buildClientPdfBlob, for windows with
 * no caller-supplied pdfBlobUrl/pdfBlob) used to fire regardless of `pdfBlobLoading`. If a
 * caller had already started its own build (the lazy `showSend ? recordId : null` fix in
 * e.g. OrderCreateInvoice), a stale `false` on the loading flag's first render could still
 * let this fallback race in and fire a SECOND jsreport request. The effect now also bails
 * out while `pdfBlobLoading` is true, matching the existing `pdfBlobUrl || pdfBlob` guards.
 */

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('lucide-react', () => ({
  Mail: () => null,
  Search: () => null,
  Loader2: () => null,
}));

const mockHasClientPdf = vi.fn();
const mockBuildClientPdfBlob = vi.fn();
vi.mock('@/windows/custom/shared/documentPdfRegistry.js', () => ({
  hasClientPdf: (...args) => mockHasClientPdf(...args),
  buildClientPdfBlob: (...args) => mockBuildClientPdfBlob(...args),
}));

import { render, waitFor } from '@testing-library/react';
import SendDocumentModal from '../SendDocumentModal.jsx';

const BASE = {
  documentType: 'GoodsShipment',
  documentNo: 'GS-001',
  bpName: 'ACME',
  documentId: 'doc-1',
  windowName: 'goods-shipment',
  token: 'tok',
  onClose: vi.fn(),
  allowEmail: true,
  // No pdfBlobUrl/pdfBlob passed — this is the window's own fallback build path.
};

beforeEach(() => {
  vi.clearAllMocks();
  mockHasClientPdf.mockReturnValue(true);
  mockBuildClientPdfBlob.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: [] } }),
  });
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fallback-generated');
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SendDocumentModal — fallback build gated on pdfBlobLoading (ETP-5308)', () => {
  it('does not call buildClientPdfBlob while pdfBlobLoading is true and no url/blob is available', async () => {
    render(<SendDocumentModal {...BASE} pdfBlobLoading />);

    // Give any stray microtask a chance to run before asserting the negative.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockBuildClientPdfBlob).not.toHaveBeenCalled();
  });

  it('calls buildClientPdfBlob once pdfBlobLoading is false and no url/blob is available (existing behavior preserved)', async () => {
    render(<SendDocumentModal {...BASE} pdfBlobLoading={false} />);

    await waitFor(() => expect(mockBuildClientPdfBlob).toHaveBeenCalledTimes(1));
    expect(mockBuildClientPdfBlob).toHaveBeenCalledWith(
      expect.objectContaining({ windowName: 'goods-shipment', documentId: 'doc-1' }),
    );
  });

  it('re-evaluates and fires the fallback once pdfBlobLoading flips from true to false without a url ever arriving', async () => {
    const { rerender } = render(<SendDocumentModal {...BASE} pdfBlobLoading />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockBuildClientPdfBlob).not.toHaveBeenCalled();

    rerender(<SendDocumentModal {...BASE} pdfBlobLoading={false} />);

    await waitFor(() => expect(mockBuildClientPdfBlob).toHaveBeenCalledTimes(1));
  });

  it('never calls the fallback when the caller already supplies a pdfBlobUrl, regardless of pdfBlobLoading', async () => {
    render(<SendDocumentModal {...BASE} pdfBlobLoading={false} pdfBlobUrl="blob:caller-supplied" />);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockBuildClientPdfBlob).not.toHaveBeenCalled();
  });
});
