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
// ETP-5518 — the stored file now renders through the shared UploadedFileViewer
// (its "Más" menu, the lightbox and ConfirmDeleteDialog), which need icons this
// panel never imports (MoreVertical, X, Upload, Trash2, ZoomIn...). Every other
// icon stays real; only the four this suite asserts on are replaced.
vi.mock('lucide-react', async (importOriginal) => ({
  ...(await importOriginal()),
  FileText: (props) => <span {...props} data-testid="icon-file" />,
  Loader2: (props) => <span {...props} data-testid="icon-loader" />,
  Paperclip: (props) => <span {...props} data-testid="icon-clip" />,
  AlertCircle: (props) => <span {...props} data-testid="icon-alert" />,
}));

// Lazy components
vi.mock('@/components/copilot/ocr/OcrInlineUploader.jsx', () => ({
  default: () => <div data-testid="ocr-uploader" />,
}));

// The stub still renders `toolbarExtra` — that is where UploadedFileViewer mounts
// the "Más" menu of a PDF, so the write-gate tests below can reach it.
// `usePdfZoom` is what the lightbox header drives; a static state is enough here.
vi.mock('../PdfViewer.jsx', () => ({
  default: ({ toolbarExtra }) => <div data-testid="pdf-viewer">{toolbarExtra}</div>,
  usePdfZoom: () => ({
    scale: 1, fitMode: 'page', canZoomIn: true, canZoomOut: true,
    zoomIn: () => {}, zoomOut: () => {}, fitToPage: () => {}, toggleFitMode: () => {},
  }),
}));

// --- Import under test ---

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OcrSidePanel, { ReadOnlyOcrSidePanel } from '../OcrSidePanel.jsx';

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
      token: 'test-token',
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

  it('renders an image slot file as an image, not through the PDF viewer', async () => {
    hookState = withFile({ attachmentId: 'att-2', fileName: 'scan.png', mimeType: 'image/png', objectUrl: 'blob:img' });
    render(<OcrSidePanel {...defaultProps} />);

    // ETP-5518 — the image is now drawn by the lazily loaded UploadedFileViewer.
    const img = await screen.findByAltText('scan.png');
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

// --- ETP-5205 (QA pasada 1): Solo-Lectura tier ---


describe('ReadOnlyOcrSidePanel (ETP-5205)', () => {
  it('shows the stored document with no attach button and no file input', () => {
    hookState = withFile({ objectUrl: 'blob:doc', mimeType: 'application/pdf', fileName: 'scan.pdf' });

    const { container } = render(<ReadOnlyOcrSidePanel {...defaultProps} />);

    expect(screen.getByText('scan.pdf')).toBeInTheDocument();
    expect(screen.queryByText('ocrSidePanelAttach')).not.toBeInTheDocument();
    expect(fileInput(container)).toBeNull();
  });

  it('without a stored document shows an empty state instead of the drop zone', () => {
    const { container } = render(<ReadOnlyOcrSidePanel {...defaultProps} />);

    expect(screen.getByTestId('ocr-side-panel-readonly-empty')).toBeInTheDocument();
    expect(dropZone(container)).toBeNull();
    expect(fileInput(container)).toBeNull();
  });

  it('a dropped file is never stored', () => {
    hookState = withFile({ objectUrl: 'blob:doc', mimeType: 'application/pdf', fileName: 'scan.pdf' });
    const { container } = render(<ReadOnlyOcrSidePanel {...defaultProps} />);

    fireEvent.drop(container.firstChild, { dataTransfer: { files: [pdfFile()] } });

    expect(storeFile).not.toHaveBeenCalled();
  });
});

// --- ETP-5518: file actions on the saved invoice's sidebar ---

/**
 * The stored file renders through UploadedFileViewer. Replace / Delete are writes, so the
 * panel hands them over only under the same gate as attaching (`canAttach`); the menu and
 * the confirmation themselves are covered in UploadedFileViewer.vitest.jsx.
 */
describe('OcrSidePanel — file actions (ETP-5518)', () => {
  const PDF_SLOT = { attachmentId: 'att-1', fileName: 'supplier.pdf', mimeType: 'application/pdf', objectUrl: 'blob:x' };
  const IMAGE_SLOT = { attachmentId: 'att-2', fileName: 'scan.png', mimeType: 'image/png', objectUrl: 'blob:img' };

  async function openDeleteConfirmation(user) {
    await user.click(await screen.findByTestId('file-viewer-more'));
    await user.click(await screen.findByTestId('file-viewer-delete'));
    return screen.findByTestId('confirm-delete-dialog');
  }

  it('offers the "Más" menu on a saved record the user can attach to', async () => {
    hookState = withFile(PDF_SLOT);
    const user = userEvent.setup();
    render(<OcrSidePanel {...defaultProps} />);

    await user.click(await screen.findByTestId('file-viewer-more'));

    const menu = await screen.findByTestId('file-viewer-menu');
    expect(within(menu).getByTestId('file-viewer-replace')).toBeInTheDocument();
    expect(within(menu).getByTestId('file-viewer-delete')).toBeInTheDocument();
  });

  it('Replace opens the same hidden file input as the attach button', async () => {
    hookState = withFile(PDF_SLOT);
    const user = userEvent.setup();
    const { container } = render(<OcrSidePanel {...defaultProps} />);
    const clickSpy = vi.spyOn(fileInput(container), 'click');

    await user.click(await screen.findByTestId('file-viewer-more'));
    await user.click(await screen.findByTestId('file-viewer-replace'));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('Delete calls useMainAttachment.deleteFile only after confirmation', async () => {
    const deleteFile = vi.fn(() => Promise.resolve());
    hookState = { ...withFile(PDF_SLOT), deleteFile };
    const user = userEvent.setup();
    render(<OcrSidePanel {...defaultProps} />);

    const dialog = await openDeleteConfirmation(user);
    expect(deleteFile).not.toHaveBeenCalled();
    await user.click(within(dialog).getByTestId('confirm-delete-confirm'));

    expect(deleteFile).toHaveBeenCalledTimes(1);
  });

  it('a failed delete does not leak an unhandled rejection and keeps the file shown', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      // A plain function, not vi.fn: a vi.fn attaches its own handlers to the promise it
      // returns (to record settled results), which would mark the rejection as handled.
      let deleteCalls = 0;
      const deleteFile = () => { deleteCalls += 1; return Promise.reject(new Error('delete failed')); };
      hookState = { ...withFile(PDF_SLOT), deleteFile };
      const user = userEvent.setup();
      render(<OcrSidePanel {...defaultProps} />);

      const dialog = await openDeleteConfirmation(user);
      await user.click(within(dialog).getByTestId('confirm-delete-confirm'));
      await new Promise((resolve) => { setTimeout(resolve, 20); });

      expect(deleteCalls).toBe(1);
      expect(unhandled).not.toHaveBeenCalled();
      expect(screen.getByText('supplier.pdf')).toBeInTheDocument();
      expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('while a write is in flight Replace and Delete are disabled', async () => {
    const deleteFile = vi.fn();
    hookState = { ...withFile(PDF_SLOT), isBusy: true, deleteFile };
    const user = userEvent.setup();
    render(<OcrSidePanel {...defaultProps} />);

    await user.click(await screen.findByTestId('file-viewer-more'));
    const del = await screen.findByTestId('file-viewer-delete');
    expect(screen.getByTestId('file-viewer-replace')).toHaveAttribute('aria-disabled', 'true');
    expect(del).toHaveAttribute('aria-disabled', 'true');
    await user.click(del);

    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('offers no "Más" menu when the record is not identifiable (no canAttach)', async () => {
    hookState = withFile(IMAGE_SLOT);
    render(<OcrSidePanel {...defaultProps} recordId={null} />);

    // The image is the viewer's own trigger, so its presence proves the viewer mounted.
    expect(await screen.findByAltText('scan.png')).toBeInTheDocument();
    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
  });

  it('Solo-Lectura: no "Más" menu, but the lightbox still opens without Replace / Delete', async () => {
    hookState = withFile(IMAGE_SLOT);
    const user = userEvent.setup();
    render(<ReadOnlyOcrSidePanel {...defaultProps} />);

    await user.click(await screen.findByTestId('file-viewer-expand'));
    const lightbox = await screen.findByTestId('file-lightbox');

    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
    expect(within(lightbox).getByTestId('file-lightbox-zoom-in')).toBeInTheDocument();
    expect(within(lightbox).queryByTestId('file-lightbox-replace')).not.toBeInTheDocument();
    expect(within(lightbox).queryByTestId('file-lightbox-delete')).not.toBeInTheDocument();
  });

  it('Solo-Lectura with a PDF: the viewer mounts with no "Más" menu', async () => {
    hookState = withFile(PDF_SLOT);
    render(<ReadOnlyOcrSidePanel {...defaultProps} />);

    expect(await screen.findByTestId('pdf-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
  });
});
