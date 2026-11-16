// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewViewer.jsx
// New file justification: the viewer (zoom, image/PDF branch, missing document, download) has no test;
// the drawer test stubs it out.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const labels = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
vi.mock('@/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useUI: () => (key) => globalThis.__labels[key] ?? key,
}));
globalThis.__labels = labels;

let mockAttachment;
const mockUseMainAttachment = vi.fn(() => mockAttachment);
vi.mock('@/windows/custom/shared/useMainAttachment.js', () => ({ useMainAttachment: (p) => mockUseMainAttachment(p) }));
const pdfProps = vi.fn();
vi.mock('@/windows/custom/shared/PdfViewer.jsx', () => ({
  default: (props) => { pdfProps(props); return <div data-testid="pdf-stub" />; },
}));

import InvoiceInboxReviewViewer, { INCOMING_DOCUMENT_TABLE } from '../InvoiceInboxReviewViewer.jsx';

const file = (over = {}) => ({ attachmentId: 'A1', objectUrl: 'blob:x', mimeType: 'application/pdf', fileName: 'main.pdf', ...over });
const tid = (id) => screen.getByTestId(id);

/** Fake the pane width the viewer measures (jsdom has no layout). */
function withPaneWidth(width) {
  return vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
}

beforeEach(() => {
  vi.restoreAllMocks();
  pdfProps.mockClear();
  mockUseMainAttachment.mockClear();
  mockAttachment = { storedFile: file(), isBusy: false };
});

describe('InvoiceInboxReviewViewer', () => {
  it('reads the main attachment of the incoming document with the session, and wires no write operation', () => {
    render(<InvoiceInboxReviewViewer documentId="D1" fileName="f.pdf" token="tk" apiBaseUrl="/sws/neo/invoice-inbox" />);
    expect(INCOMING_DOCUMENT_TABLE).toBe('ETGO_Incoming_Document');
    expect(mockUseMainAttachment).toHaveBeenCalledWith({
      documentId: 'D1', tableName: 'ETGO_Incoming_Document', storeCondition: true, token: 'tk', apiBaseUrl: '/sws/neo/invoice-inbox',
    });
    expect(Object.keys(mockUseMainAttachment.mock.calls[0][0]).sort()).toEqual(['apiBaseUrl', 'documentId', 'storeCondition', 'tableName', 'token']);
  });

  it('shows a loading state while the attachment is being fetched', () => {
    mockAttachment = { storedFile: null, isBusy: true };
    render(<InvoiceInboxReviewViewer documentId="D1" apiBaseUrl="/x" />);
    expect(tid('invoice-inbox-review-viewer-loading')).toHaveTextContent('Cargando el documento…');
  });

  it('no main attachment: "El documento original no está disponible"', () => {
    mockAttachment = { storedFile: null, isBusy: false };
    render(<InvoiceInboxReviewViewer documentId="D1" apiBaseUrl="/x" />);
    expect(tid('invoice-inbox-review-viewer-empty')).toHaveTextContent('El documento original no está disponible');
    expect(screen.queryByTestId('invoice-inbox-review-viewer-toolbar')).toBeNull();
  });

  it('a download failure (hook ends idle with no file) shows the same unavailable text', () => {
    mockAttachment = { storedFile: undefined, isBusy: false };
    render(<InvoiceInboxReviewViewer documentId="D1" apiBaseUrl="/x" />);
    expect(tid('invoice-inbox-review-viewer-empty')).toBeInTheDocument();
  });

  it('PDF branch: toolbar label, zoom readout and a download link to the blob', async () => {
    withPaneWidth(1000);
    render(<InvoiceInboxReviewViewer documentId="D1" fileName="f.pdf" apiBaseUrl="/x" />);
    expect(tid('invoice-inbox-review-viewer-label')).toHaveTextContent('Documento original');
    await waitFor(() => expect(tid('pdf-stub')).toBeInTheDocument());
    const link = tid('invoice-inbox-review-viewer-download');
    expect(link).toHaveAttribute('href', 'blob:x');
    expect(link).toHaveAttribute('download', 'main.pdf');
    expect(pdfProps.mock.calls.at(-1)[0]).toMatchObject({ url: 'blob:x', hideToolbar: true });
  });

  it('download is absent without a blob URL and falls back to the row file name', () => {
    mockAttachment = { storedFile: file({ objectUrl: null }), isBusy: false };
    render(<InvoiceInboxReviewViewer documentId="D1" apiBaseUrl="/x" />);
    expect(screen.queryByTestId('invoice-inbox-review-viewer-download')).toBeNull();
  });

  it('PDF page width is 595*zoom/100 at any pane width: scale = pageWidth / basis, readout truthful', async () => {
    withPaneWidth(1048); // basis = 1048 - 48 gaps = 1000
    render(<InvoiceInboxReviewViewer documentId="D1" apiBaseUrl="/x" />);
    await waitFor(() => expect(tid('invoice-inbox-review-viewer-zoom')).toHaveTextContent('100%'));
    await waitFor(() => expect(pdfProps.mock.calls.at(-1)[0].zoom.scale).toBeCloseTo(595 / 1000, 5));
    fireEvent.click(tid('invoice-inbox-review-viewer-zoom-in'));
    expect(tid('invoice-inbox-review-viewer-zoom')).toHaveTextContent('115%');
    await waitFor(() => expect(pdfProps.mock.calls.at(-1)[0].zoom.scale).toBeCloseTo((595 * 1.15) / 1000, 5));
  });

  it('a pane narrower than a sheet starts at the zoom that fits it', async () => {
    withPaneWidth(448); // inner = 400 -> floor(400/595*20)*5 = 65
    render(<InvoiceInboxReviewViewer documentId="D1" apiBaseUrl="/x" />);
    await waitFor(() => expect(tid('invoice-inbox-review-viewer-zoom')).toHaveTextContent('65%'));
  });

  it('zoom steps by 15 and stops at 40 and 160 (buttons disable)', async () => {
    withPaneWidth(1000);
    render(<InvoiceInboxReviewViewer documentId="D1" apiBaseUrl="/x" />);
    const out = tid('invoice-inbox-review-viewer-zoom-out');
    const inn = tid('invoice-inbox-review-viewer-zoom-in');
    for (let i = 0; i < 10; i += 1) fireEvent.click(out);
    expect(tid('invoice-inbox-review-viewer-zoom')).toHaveTextContent('40%');
    expect(out).toBeDisabled();
    for (let i = 0; i < 12; i += 1) fireEvent.click(inn);
    expect(tid('invoice-inbox-review-viewer-zoom')).toHaveTextContent('160%');
    expect(inn).toBeDisabled();
  });

  it('image branch: renders the image at 595*zoom/100 px with the same readout, no PDF viewer', async () => {
    withPaneWidth(1000);
    mockAttachment = { storedFile: file({ mimeType: 'image/png', fileName: 'scan.png', objectUrl: 'blob:img' }), isBusy: false };
    render(<InvoiceInboxReviewViewer documentId="D1" apiBaseUrl="/x" />);
    const img = tid('invoice-inbox-review-viewer-image');
    expect(img).toHaveAttribute('src', 'blob:img');
    expect(img.style.width).toBe('595px');
    expect(screen.queryByTestId('pdf-stub')).toBeNull();
    fireEvent.click(tid('invoice-inbox-review-viewer-zoom-in'));
    expect(tid('invoice-inbox-review-viewer-image').style.width).toBe(`${(595 * 115) / 100}px`);
    expect(tid('invoice-inbox-review-viewer-zoom')).toHaveTextContent('115%');
  });
});
