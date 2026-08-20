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

// DocumentView (edit mode) is backed by useMainAttachment (ETP-4315) — the same
// real, marked Attachment row the grid preview reads. We drive the panel
// through this hook the way the old file drove it through usePreviewAttachment.
let hookArgs = null;
let hookState = null;
const storeFile = vi.fn();
vi.mock('../useMainAttachment.js', () => ({
  useMainAttachment: (args) => { hookArgs = args; return hookState; },
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
  docTypeId: 'purchase-invoice',
  isNew: false,
};

const emptySlot = {
  storedFile: null,
  isBusy: false,
  storeFailed: false,
  storeFile,
  storeBlob: vi.fn(),
  storeUrl: vi.fn(),
  markExisting: vi.fn(),
  deleteFile: vi.fn(),
};
const withFile = (file) => ({ ...emptySlot, storedFile: file });

const pdfFile = (name = 'invoice.pdf') =>
  new File(['%PDF-1.4'], name, { type: 'application/pdf' });

function fileInput(container) {
  return container.querySelector('input[type="file"]');
}

function dropZone(container) {
  return container.querySelector('button');
}

beforeEach(() => {
  vi.clearAllMocks();
  hookArgs = null;
  hookState = emptySlot;
});

// --- Tests ---

/**
 * ETP-4855 Error 3 asked for the "Messages" / "History" tabs and the
 * context-menu button to be removed. These are regression guards: each one
 * was visible in staging and must not come back.
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
 * The panel shows the record's real, marked Attachment — the same row the
 * grid preview and the Attachments tab read — via useMainAttachment.
 */
describe('OcrSidePanel — the document slot', () => {
  it('reads the record identity and asks useMainAttachment for its main attachment', () => {
    render(<OcrSidePanel {...defaultProps} />);
    expect(hookArgs).toMatchObject({
      documentId: 'inv-1',
      tableName: 'C_Invoice',
      storeCondition: true,
      apiBaseUrl: '/sws/neo/purchase-invoice',
    });
  });

  it('shows the empty state with an attach action when the slot is empty', () => {
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    expect(screen.getByText('ocrSidePanelNoAttachments')).toBeInTheDocument();
    expect(screen.getByText('ocrSidePanelAttach')).toBeInTheDocument();
    expect(fileInput(container)).toBeTruthy();
  });

  it('shows a spinner while the slot is loading and nothing is attached yet', () => {
    hookState = { ...emptySlot, isBusy: true };
    render(<OcrSidePanel {...defaultProps} />);
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    expect(screen.queryByText('ocrSidePanelNoAttachments')).toBeNull();
  });

  it('renders a PDF slot file in the PdfViewer, with the attach action still available', async () => {
    hookState = withFile({ attachmentId: 'att-1', fileName: 'supplier.pdf', mimeType: 'application/pdf', objectUrl: 'blob:x' });
    render(<OcrSidePanel {...defaultProps} />);

    expect(screen.getByText('supplier.pdf')).toBeInTheDocument();
    expect(screen.getByText('ocrSidePanelAttach')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument());
  });

  it('renders an image slot file as an image, not through the PDF viewer', () => {
    hookState = withFile({ attachmentId: 'att-2', fileName: 'scan.png', mimeType: 'image/png', objectUrl: 'blob:img' });
    render(<OcrSidePanel {...defaultProps} />);

    const img = screen.getByAltText('scan.png');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe('blob:img');
    expect(screen.queryByTestId('pdf-viewer')).toBeNull();
  });

  it('stores a picked PDF via storeFile', () => {
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    const file = pdfFile();

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    expect(storeFile).toHaveBeenCalledWith(file);
  });

  it('rejects a disallowed file type without calling storeFile', () => {
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

  it('hides the attach action when the record is not yet identifiable', () => {
    render(<OcrSidePanel {...defaultProps} recordId={null} />);
    expect(screen.getByText('ocrSidePanelNoAttachments')).toBeInTheDocument();
    expect(screen.queryByText('ocrSidePanelAttach')).toBeNull();
  });
});

/**
 * Drag-and-drop is a second way to attach, on top of click-to-browse. It must
 * work both before anything is attached and once a file already fills the slot.
 */
describe('OcrSidePanel — drag and drop', () => {
  it('stores a dropped PDF in the empty state', () => {
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    const file = pdfFile();

    fireEvent.drop(dropZone(container), { dataTransfer: { files: [file] } });

    expect(storeFile).toHaveBeenCalledWith(file);
  });

  it('rejects a dropped file of a disallowed type in the empty state', () => {
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    const odd = new File(['x'], 'notes.txt', { type: 'text/plain' });

    fireEvent.drop(dropZone(container), { dataTransfer: { files: [odd] } });

    expect(storeFile).not.toHaveBeenCalled();
    expect(screen.getByText('ocrInlinePdfOnly')).toBeInTheDocument();
  });

  it('stores a dropped file in the filled state too', () => {
    hookState = withFile({ attachmentId: 'att-1', fileName: 'supplier.pdf', mimeType: 'application/pdf', objectUrl: 'blob:x' });
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    const file = pdfFile('replacement.pdf');

    fireEvent.drop(container.querySelector('.min-h-0.flex-1'), { dataTransfer: { files: [file] } });

    expect(storeFile).toHaveBeenCalledWith(file);
  });

  it('does not crash on dragOver/dragLeave in the empty state', () => {
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    const zone = dropZone(container);

    fireEvent.dragOver(zone);
    fireEvent.dragLeave(zone, { relatedTarget: document.body });
    // Should not crash — visual state changes only
  });
});

describe('OcrSidePanel — re-attach button', () => {
  it('clicking the re-attach button opens the hidden file input', () => {
    hookState = withFile({ attachmentId: 'att-1', fileName: 'supplier.pdf', mimeType: 'application/pdf', objectUrl: 'blob:x' });
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    const input = fileInput(container);
    const clickSpy = vi.spyOn(input, 'click');

    fireEvent.click(screen.getByText('ocrSidePanelAttach'));

    expect(clickSpy).toHaveBeenCalled();
  });

  it('picking a replacement file through the input triggers storeFile', () => {
    hookState = withFile({ attachmentId: 'att-1', fileName: 'supplier.pdf', mimeType: 'application/pdf', objectUrl: 'blob:x' });
    const { container } = render(<OcrSidePanel {...defaultProps} />);

    fireEvent.change(fileInput(container), { target: { files: [pdfFile('new.pdf')] } });

    expect(storeFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'new.pdf' }));
  });
});
