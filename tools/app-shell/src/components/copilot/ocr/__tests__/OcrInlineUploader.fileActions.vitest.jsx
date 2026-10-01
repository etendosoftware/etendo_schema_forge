/**
 * ETP-5518 — the new purchase invoice's OCR uploader renders the picked (still local, not
 * yet saved) PDF through UploadedFileViewer. Its "Más" menu acts on that local file:
 * Replace opens the uploader's own picker, Delete asks for confirmation and then clears
 * the file exactly like the pre-existing X, which keeps clearing without a confirmation.
 */

let mockExtractionReturn;

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({ token: 'test-token' }),
}));

vi.mock('../ocrDocTypes', () => ({
  getOcrDocType: (id) => (id === 'purchase-invoice' ? {
    id: 'purchase-invoice',
    routePrefix: '/purchase-invoice/',
    toolName: 'SimpleOcrTool',
    eventName: 'copilot:ocr-prefill:purchase-invoice',
    question: 'Extract invoice fields',
    tabId: '290',
    tableName: 'C_Invoice',
    structuredOutput: true,
  } : null),
}));

vi.mock('../listAttachments', () => ({
  uploadAndMarkMainAttachment: vi.fn().mockResolvedValue({ id: 'att-1' }),
}));

vi.mock('../buildOcrSchema', () => ({
  buildOcrSchema: () => ({ type: 'object', properties: {} }),
}));

vi.mock('../useOcrExtraction', () => ({
  useOcrExtraction: () => mockExtractionReturn,
}));

vi.mock('../useOcrFlow', () => ({
  useOcrFlow: () => ({ result: null, loading: false, pendingModal: null }),
}));

// The stub renders `toolbarExtra`, where UploadedFileViewer mounts the PDF's "Más" menu.
vi.mock('@/windows/custom/shared/PdfViewer.jsx', () => ({
  default: ({ url, toolbarExtra }) => <div data-testid="pdf-viewer" data-url={url}>{toolbarExtra}</div>,
  usePdfZoom: () => ({
    scale: 1, fitMode: 'page', canZoomIn: true, canZoomOut: true,
    zoomIn: () => {}, zoomOut: () => {}, fitToPage: () => {}, toggleFitMode: () => {},
  }),
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OcrInlineUploader from '../OcrInlineUploader.jsx';

const defaultProps = {
  docTypeId: 'purchase-invoice',
  isNew: true,
  apiBaseUrl: '/sws/neo/purchase-invoice',
  onRefresh: vi.fn(),
  token: 'test-token',
};

function pdf(name = 'invoice.pdf') {
  return new File([new ArrayBuffer(2048)], name, { type: 'application/pdf' });
}

function fileInput(container) {
  return container.querySelector('input[type="file"]');
}

/** Render, pick a PDF and wait for the lazily loaded viewer with its "Más" button. */
async function renderWithFile(props = {}) {
  const user = userEvent.setup();
  const utils = render(<OcrInlineUploader {...defaultProps} {...props} />);
  fireEvent.change(fileInput(utils.container), { target: { files: [pdf()] } });
  await screen.findByTestId('file-viewer-more');
  return { user, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExtractionReturn = { extract: vi.fn(), status: 'idle', error: null, reset: vi.fn() };
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:local');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('OcrInlineUploader — file actions on the local file (ETP-5518)', () => {
  it('renders the picked file through the shared viewer with a "Más" menu', async () => {
    const { user } = await renderWithFile();

    expect(screen.getByTestId('pdf-viewer')).toHaveAttribute('data-url', 'blob:local');
    await user.click(screen.getByTestId('file-viewer-more'));

    const menu = await screen.findByTestId('file-viewer-menu');
    expect(within(menu).getByTestId('file-viewer-replace')).toBeInTheDocument();
    expect(within(menu).getByTestId('file-viewer-delete')).toBeInTheDocument();
  });

  it('menu Delete asks for confirmation, then clears the local file', async () => {
    const { user } = await renderWithFile();
    mockExtractionReturn.reset.mockClear(); // picking the file already reset the extraction

    await user.click(screen.getByTestId('file-viewer-more'));
    await user.click(await screen.findByTestId('file-viewer-delete'));
    const dialog = await screen.findByTestId('confirm-delete-dialog');
    // Still there until confirmed.
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(mockExtractionReturn.reset).not.toHaveBeenCalled();

    await user.click(within(dialog).getByTestId('confirm-delete-confirm'));

    await waitFor(() => expect(screen.queryByText('invoice.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('ocrSidePanelDropTitle')).toBeInTheDocument();
    expect(mockExtractionReturn.reset).toHaveBeenCalled();
  });

  it('cancelling the confirmation keeps the local file', async () => {
    const { user } = await renderWithFile();

    await user.click(screen.getByTestId('file-viewer-more'));
    await user.click(await screen.findByTestId('file-viewer-delete'));
    await user.click(await screen.findByTestId('confirm-delete-cancel'));

    await waitFor(() => expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument());
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();
  });

  it('the pre-existing X still clears immediately, without a confirmation', async () => {
    const { user } = await renderWithFile();
    mockExtractionReturn.reset.mockClear(); // picking the file already reset the extraction

    await user.click(screen.getByLabelText('cancel'));

    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('invoice.pdf')).not.toBeInTheDocument();
    expect(mockExtractionReturn.reset).toHaveBeenCalled();
  });

  it('menu Replace opens the uploader file picker, and the new file takes the old one place', async () => {
    const { user, container } = await renderWithFile();
    const input = fileInput(container);
    const clickSpy = vi.spyOn(input, 'click');

    await user.click(screen.getByTestId('file-viewer-more'));
    await user.click(await screen.findByTestId('file-viewer-replace'));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { files: [pdf('replacement.pdf')] } });

    expect(await screen.findByText('replacement.pdf')).toBeInTheDocument();
    expect(screen.queryByText('invoice.pdf')).not.toBeInTheDocument();
  });

  it('while extraction runs, Replace and Delete are disabled like the X', async () => {
    const { user, rerender } = await renderWithFile();
    mockExtractionReturn = { ...mockExtractionReturn, status: 'extracting' };
    rerender(<OcrInlineUploader {...defaultProps} />);

    expect(screen.getByLabelText('cancel')).toBeDisabled();
    await user.click(screen.getByTestId('file-viewer-more'));
    const del = await screen.findByTestId('file-viewer-delete');
    expect(screen.getByTestId('file-viewer-replace')).toHaveAttribute('aria-disabled', 'true');
    expect(del).toHaveAttribute('aria-disabled', 'true');
    await user.click(del);

    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
  });
});
