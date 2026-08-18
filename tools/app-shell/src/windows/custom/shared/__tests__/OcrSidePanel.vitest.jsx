// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/purchase-invoice/123' }),
}));

vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({
  matchOcrDocType: () => ({ id: 'purchase-invoice', tableName: 'C_Invoice' }),
  getOcrDocType: () => ({ tableName: 'C_Invoice' }),
}));

// The document slot itself has its own tests (usePreviewAttachment.vitest.jsx);
// here we drive the panel through it.
let hookArgs = null;
let hookState = null;
const storeFile = vi.fn();
vi.mock('../usePreviewAttachment.js', () => ({
  usePreviewAttachment: (args) => { hookArgs = args; return hookState; },
  ACCEPTED_TYPES: { 'application/pdf': 'pdf', 'image/png': 'image' },
  ACCEPT_ATTR: 'application/pdf,image/png',
}));

// The panel passes each icon an auto-generated `data-testid` (see
// scripts/apply-add-data-testid.sh), so our own must come AFTER the spread —
// otherwise the component's value wins and these handles are unreachable.
vi.mock('lucide-react', () => ({
  FileText: (props) => <span {...props} data-testid="icon-file" />,
  Loader2: (props) => <span {...props} data-testid="icon-loader" />,
  Paperclip: (props) => <span {...props} data-testid="icon-clip" />,
  AlertCircle: (props) => <span {...props} data-testid="icon-alert" />,
}));

// Lazy components
vi.mock('@/components/copilot/ocr/OcrInlineUploader.jsx', () => ({
  default: () => <div data-testid="ocr-uploader" />,
}));

vi.mock('../PdfViewer.jsx', () => ({
  default: () => <div data-testid="pdf-viewer" />,
}));

// --- Import under test ---

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OcrSidePanel from '../OcrSidePanel.jsx';

// --- Helpers ---

const defaultProps = {
  recordId: 'inv-1',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/purchase-invoice',
  isNew: false,
};

const emptySlot = { storedFile: null, isBusy: false, storeFailed: false, storeFile, storeBlob: vi.fn(), storeUrl: vi.fn(), deleteFile: vi.fn() };
const withFile = (file) => ({ ...emptySlot, storedFile: file });

const pdfFile = (name = 'invoice.pdf') =>
  new File(['%PDF-1.4'], name, { type: 'application/pdf' });

function fileInput(container) {
  return container.querySelector('input[type="file"]');
}

beforeEach(() => {
  vi.clearAllMocks();
  hookArgs = null;
  hookState = emptySlot;
});

// --- Tests ---

/**
 * ETP-4855 Error 3 asked for three removals. These are regression guards: each
 * one was visible in staging and must not come back.
 */
describe('OcrSidePanel — removed placeholder UI', () => {
  it('renders no Messages or History tab', () => {
    render(<OcrSidePanel {...defaultProps} />);
    expect(screen.queryByText('ocrSidePanelTabMessages')).toBeNull();
    expect(screen.queryByText('ocrSidePanelTabHistory')).toBeNull();
    expect(screen.queryByText('ocrSidePanelComingSoon')).toBeNull();
  });

  it('renders no tab bar at all now that a single view is left', () => {
    render(<OcrSidePanel {...defaultProps} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('renders no context-menu button', () => {
    render(<OcrSidePanel {...defaultProps} />);
    expect(screen.queryByLabelText('ocrSidePanelMore')).toBeNull();
  });
});

describe('OcrSidePanel — OCR reader gating', () => {
  it('offers the OCR reader on a new record', async () => {
    render(<OcrSidePanel {...defaultProps} isNew />);
    expect(screen.getByText('ocrSidePanelTitle')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('ocr-uploader')).toBeInTheDocument();
    });
  });

  it('never mounts the OCR reader on a saved record', () => {
    // The uploader is the only thing that dispatches the extraction event, so
    // keeping it unmounted is what stops the reader from running against an
    // invoice that was captured by hand.
    render(<OcrSidePanel {...defaultProps} />);
    expect(screen.queryByTestId('ocr-uploader')).toBeNull();
    expect(screen.queryByText('ocrSidePanelTitle')).toBeNull();
  });
});

/**
 * The panel shows the record's document slot — the OCR source — and nothing
 * else. Files added through the Attachments tab never surface here.
 */
describe('OcrSidePanel — the document slot', () => {
  it('reads the slot of this record and asks for the attachments mirror', () => {
    render(<OcrSidePanel {...defaultProps} />);
    expect(hookArgs).toMatchObject({
      documentId: 'inv-1',
      specName: 'purchase-invoice',
      storeCondition: true,
      token: 'test-token',
      apiBaseUrl: '/sws/neo/purchase-invoice',
      // Mirrors into the record's attachments so the file shows in that tab.
      tableName: 'C_Invoice',
    });
  });

  it('shows the empty state with an attach action when the slot is empty', () => {
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    expect(screen.getByText('ocrSidePanelNoAttachments')).toBeInTheDocument();
    expect(screen.getByText('ocrSidePanelAttach')).toBeInTheDocument();
    expect(fileInput(container)).toBeTruthy();
  });

  it('stores a picked PDF in the slot', () => {
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    const file = pdfFile();

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    expect(storeFile).toHaveBeenCalledWith(file);
  });

  it('rejects a file type the preview cannot render', () => {
    const { container } = render(<OcrSidePanel {...defaultProps} />);

    const odd = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(fileInput(container), { target: { files: [odd] } });

    expect(storeFile).not.toHaveBeenCalled();
    expect(screen.getByText('ocrInlinePdfOnly')).toBeInTheDocument();
  });

  it('surfaces a failed store instead of pretending it worked', () => {
    hookState = { ...emptySlot, storeFailed: true };
    render(<OcrSidePanel {...defaultProps} />);
    expect(screen.getByText('ocrSidePanelAttachError')).toBeInTheDocument();
  });

  it('renders a PDF slot file in the viewer, with the attach action still available', async () => {
    hookState = withFile({ fileName: 'supplier.pdf', mimeType: 'application/pdf', objectUrl: 'blob:x' });
    render(<OcrSidePanel {...defaultProps} />);

    expect(screen.getByText('supplier.pdf')).toBeInTheDocument();
    expect(screen.getByText('ocrSidePanelAttach')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument());
  });

  it('renders an image slot file as an image, not through the PDF viewer', () => {
    hookState = withFile({ fileName: 'scan.png', mimeType: 'image/png', objectUrl: 'blob:img' });
    render(<OcrSidePanel {...defaultProps} />);

    const img = screen.getByAltText('scan.png');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe('blob:img');
    expect(screen.queryByTestId('pdf-viewer')).toBeNull();
  });

  it('shows a spinner while the slot is loading', () => {
    hookState = { ...emptySlot, isBusy: true };
    render(<OcrSidePanel {...defaultProps} />);
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    expect(screen.queryByText('ocrSidePanelNoAttachments')).toBeNull();
  });

  it('hides the attach action when the record is not yet identifiable', () => {
    render(<OcrSidePanel {...defaultProps} recordId={null} />);
    expect(screen.getByText('ocrSidePanelNoAttachments')).toBeInTheDocument();
    expect(screen.queryByText('ocrSidePanelAttach')).toBeNull();
  });
});
