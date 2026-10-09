// @covers tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx

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
  Download: () => null,
  Mail: () => null,
  Maximize: () => null,
  X: () => null,
  Plus: () => null,
  Search: () => null,
  Loader2: () => null,
}));

// A PDF blob is previewed through the react-pdf viewer (ETP-5598); pdfjs cannot run in jsdom.
vi.mock('@/windows/custom/shared/PdfViewer.jsx', () => ({
  default: ({ url }) => <div data-testid="pdf-viewer" data-url={url} />,
}));

const mockHasClientPdf = vi.fn();
const mockBuildClientPdfBlob = vi.fn();
vi.mock('@/windows/custom/shared/documentPdfRegistry.js', () => ({
  hasClientPdf: (...args) => mockHasClientPdf(...args),
  buildClientPdfBlob: (...args) => mockBuildClientPdfBlob(...args),
}));

// The send path stops at the email-send boundary: what it receives as `pdfBlobUrl` is the file
// cached as the record's main attachment, i.e. the one the customer gets.
const mockSendDocumentEmail = vi.fn();
vi.mock('../documentEmailSend.js', () => ({
  sendDocumentEmail: (...args) => mockSendDocumentEmail(...args),
}));

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  mockSendDocumentEmail.mockResolvedValue({ status: 'SENT' });
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

const RENDER_URL = '/api/reports/print-goods-shipment/render';
const renderCalls = () => global.fetch.mock.calls.filter(([url]) => url === RENDER_URL);
const previewIframe = () => document.querySelector('iframe[title="Document preview"]');

describe('SendDocumentModal — preview state while the PDF blob is pending', () => {
  it('replaces the spinner with PdfViewer once the caller blob URL arrives, with no stale spinner or error card', async () => {
    const { rerender } = render(<SendDocumentModal {...BASE} pdfBlobLoading />);
    expect(screen.getByText('sendModalLoadingPreview')).toBeInTheDocument();
    expect(renderCalls()).toHaveLength(0);

    rerender(<SendDocumentModal {...BASE} pdfBlobLoading={false} pdfBlobUrl="blob:arrived" />);

    expect(await screen.findByTestId('pdf-viewer')).toHaveAttribute('data-url', 'blob:arrived');
    expect(screen.queryByText('sendModalLoadingPreview')).not.toBeInTheDocument();
    expect(screen.queryByText('sendModalPdfNotConfigured')).not.toBeInTheDocument();
    expect(previewIframe()).toBeNull();
    expect(renderCalls()).toHaveLength(0);
  });

  it('falls back to the HTML render when the caller build ends without a URL', async () => {
    mockHasClientPdf.mockReturnValue(false);
    const { rerender } = render(<SendDocumentModal {...BASE} pdfBlobLoading />);
    expect(renderCalls()).toHaveLength(0);

    rerender(<SendDocumentModal {...BASE} pdfBlobLoading={false} />);

    await waitFor(() => expect(renderCalls()).toHaveLength(1));
    expect(renderCalls()[0][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(previewIframe()).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
  });

  it('falls back to the HTML render when the modal’s own PDF build fails', async () => {
    mockBuildClientPdfBlob.mockRejectedValue(new Error('jsreport down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<SendDocumentModal {...BASE} />);

    await waitFor(() => expect(renderCalls()).toHaveLength(1));
    expect(previewIframe()).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
  });

  it('previews and downloads the same PDF when the modal built it itself', async () => {
    const user = userEvent.setup();
    const downloadedHrefs = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload() {
      downloadedHrefs.push(this.getAttribute('href'));
    });
    render(<SendDocumentModal {...BASE} />);

    expect(await screen.findByTestId('pdf-viewer')).toHaveAttribute('data-url', 'blob:fallback-generated');
    await user.click(screen.getByTestId('send-modal-download'));

    expect(downloadedHrefs).toEqual(['blob:fallback-generated']);
    // Download reuses the blob: it never goes to jsreport for a second PDF.
    expect(global.fetch).not.toHaveBeenCalledWith('/jsreport/api/report', expect.anything());
  });

  // The HTML render request can still be in flight when the blob URL arrives. Its late answer
  // must not bring the HTML path back over the PdfViewer.
  function holdRenderResponse() {
    let resolveRender;
    global.fetch.mockImplementation((url) => {
      if (url === RENDER_URL) return new Promise((resolve) => { resolveRender = resolve; });
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
    });
    return (response) => act(async () => { resolveRender(response); });
  }

  function expectOnlyPdfViewer(url) {
    expect(screen.getByTestId('pdf-viewer')).toHaveAttribute('data-url', url);
    expect(previewIframe()).toBeNull();
    expect(screen.queryByText('sendModalLoadingPreview')).not.toBeInTheDocument();
    expect(screen.queryByText('sendModalPdfNotConfigured')).not.toBeInTheDocument();
  }

  // The caller path makes the in-flight request deterministic: the HTML render starts while
  // there is no URL, and the blob URL lands before it answers.
  async function renderThenBlobArrives() {
    mockHasClientPdf.mockReturnValue(false);
    const answerRender = holdRenderResponse();
    const { rerender } = render(<SendDocumentModal {...BASE} pdfBlobLoading={false} />);
    await waitFor(() => expect(renderCalls()).toHaveLength(1));
    rerender(<SendDocumentModal {...BASE} pdfBlobUrl="blob:arrived" />);
    await screen.findByTestId('pdf-viewer');
    return answerRender;
  }

  it('keeps the PdfViewer when a failing HTML render answers after the blob URL arrived', async () => {
    const answerRender = await renderThenBlobArrives();
    await answerRender({ ok: false, status: 500, text: async () => '' });
    expectOnlyPdfViewer('blob:arrived');
  });

  it('keeps the PdfViewer when a successful HTML render answers after the blob URL arrived', async () => {
    const answerRender = await renderThenBlobArrives();
    await answerRender({ ok: true, status: 200, text: async () => '<p>late</p>' });
    expectOnlyPdfViewer('blob:arrived');
  });
});

describe('SendDocumentModal — the sent attachment is the previewed PDF', () => {
  const sendButton = () => screen.getByRole('button', { name: /sendModalSend/ });

  it('sends the PDF the modal built and previewed itself', async () => {
    const user = userEvent.setup();
    render(<SendDocumentModal {...BASE} bpEmail="buyer@acme.com" />);

    const previewUrl = (await screen.findByTestId('pdf-viewer')).getAttribute('data-url');
    await user.click(sendButton());

    await waitFor(() => expect(mockSendDocumentEmail).toHaveBeenCalledTimes(1));
    expect(previewUrl).toBe('blob:fallback-generated');
    expect(mockSendDocumentEmail).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      windowName: 'goods-shipment',
      pdfBlobUrl: previewUrl,
    }));
  });

  it('sends the caller-supplied PDF that is being previewed', async () => {
    const user = userEvent.setup();
    const pdfBlob = new Blob(['%PDF-caller'], { type: 'application/pdf' });
    render(<SendDocumentModal {...BASE} bpEmail="buyer@acme.com" pdfBlob={pdfBlob} pdfBlobUrl="blob:caller-supplied" />);

    const previewUrl = (await screen.findByTestId('pdf-viewer')).getAttribute('data-url');
    await user.click(sendButton());

    await waitFor(() => expect(mockSendDocumentEmail).toHaveBeenCalledTimes(1));
    expect(previewUrl).toBe('blob:caller-supplied');
    expect(mockSendDocumentEmail).toHaveBeenCalledWith(expect.objectContaining({ pdfBlobUrl: previewUrl, pdfBlob }));
    expect(mockBuildClientPdfBlob).not.toHaveBeenCalled();
  });
});
